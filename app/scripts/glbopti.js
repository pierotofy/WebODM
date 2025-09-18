const path = require('path');
const { NodeIO, Extension } = require('@gltf-transform/core');
const { KHRONOS_EXTENSIONS } = require('@gltf-transform/extensions');
const { textureCompress, simplify, weld, draco } = require('@gltf-transform/functions');
const { MeshoptSimplifier } = require('meshoptimizer');
const draco3d = require('draco3dgltf');

/// Added/modified from glTF-Transform toktx.ts

const {
    BufferUtils,
    FileUtils,
    ImageUtils,
    TextureChannel,
    uuid,
} = require('@gltf-transform/core');
const { KHRTextureBasisu } = require('@gltf-transform/extensions');
const {
    createTransform,
    fitPowerOfTwo,
    fitWithin,
    getTextureChannelMask,
    getTextureColorSpace,
    listTextureSlots,
    TextureResizeFilter,
} = require('@gltf-transform/functions');
const fs = require('fs/promises');
const { rm } = require('fs/promises');
const { default: pLimit } = require('p-limit');
const { join } = require('path');
const { spawn } = require('child_process');

const NUM_CPUS = 2;
const KTX_SOFTWARE_VERSION_MIN = '4.3.0';

const { R, G, A } = TextureChannel;

const Mode = {
    ETC1S: 'etc1s',
    UASTC: 'uastc',
};

const Filter = {
    BOX: 'box',
    TENT: 'tent',
    BELL: 'bell',
    BSPLINE: 'b-spline',
    MITCHELL: 'mitchell',
    LANCZOS3: 'lanczos3',
    LANCZOS4: 'lanczos4',
    LANCZOS6: 'lanczos6',
    LANCZOS12: 'lanczos12',
    BLACKMAN: 'blackman',
    KAISER: 'kaiser',
    GAUSSIAN: 'gaussian',
    CATMULLROM: 'catmullrom',
    QUADRATIC_INTERP: 'quadratic_interp',
    QUADRATIC_APPROX: 'quadratic_approx',
    QUADRATIC_MIX: 'quadratic_mix',
};

const GLOBAL_DEFAULTS = {
    resizeFilter: TextureResizeFilter.LANCZOS3,
    filter: Filter.LANCZOS4,
    filterScale: 1,
    pattern: null,
    slots: null,
    // See: https://github.com/donmccurdy/glTF-Transform/pull/389#issuecomment-1089842185
    jobs: NUM_CPUS,
    cleanup: true,
    limitInputPixels: true,
};

const ETC1S_DEFAULTS = {
    quality: 128,
    compression: 1,
    rdo: true,
    rdoThreshold: 1.25,
    maxSelectors: 0,
    maxEndpoints: 0,
    ...GLOBAL_DEFAULTS,
};

const UASTC_DEFAULTS = {
    level: 2,
    rdo: false,
    rdoLambda: 1.0,
    rdoDictionarySize: 32768,
    rdoBlockScale: 10.0,
    rdoStdDev: 18.0,
    rdoMultithreading: true,
    zstd: 18,
    ...GLOBAL_DEFAULTS,
};

const toktx = function (options) {
    options = {
        ...(options.mode === Mode.ETC1S ? ETC1S_DEFAULTS : UASTC_DEFAULTS),
        ...options,
    };

    return createTransform(options.mode, async (doc) => {
        const logger = doc.getLogger();

        // Confirm recent version of KTX-Software is installed.
        await checkKTXSoftware(logger);

        // Create workspace. Avoid 'unsafeCleanup' and 'setGracefulCleanup', which
        // are not working as expected and are slated for removal:
        // https://github.com/raszi/node-tmp/pull/281
        const batchPrefix = uuid();
        const batchDir = options.tmpDir;
        await fs.mkdir(batchDir, { recursive: true });

        const basisuExtension = doc.createExtension(KHRTextureBasisu).setRequired(true);

        const limit = pLimit(options.jobs);
        const textures = doc.getRoot().listTextures();
        const numTextures = textures.length;
        const promises = textures.map((texture, textureIndex) =>
            limit(async () => {
                const slots = listTextureSlots(texture);
                const channels = getTextureChannelMask(texture);
                const textureLabel =
                    texture.getURI() ||
                    texture.getName() ||
                    `${textureIndex + 1}/${doc.getRoot().listTextures().length}`;
                const prefix = `ktx:texture(${textureLabel})`;
                logger.debug(`${prefix}: Slots → [${slots.join(', ')}]`);

                // FILTER: Exclude textures that don't match (a) 'slots' or (b) expected formats.

                const patternRe = options.pattern;
                const slotsRe = options.slots;

                let srcMimeType = texture.getMimeType();

                if (srcMimeType === 'image/ktx2') {
                    logger.debug(`${prefix}: Skipping, already KTX.`);
                    return;
                } else if (srcMimeType !== 'image/png' && srcMimeType !== 'image/jpeg') {
                    logger.warn(`${prefix}: Skipping, unsupported texture type "${texture.getMimeType()}".`);
                    return;
                } else if (slotsRe && !slots.find((slot) => slot.match(slotsRe))) {
                    logger.debug(`${prefix}: Skipping, [${slots.join(', ')}] excluded by "slots" parameter.`);
                    return;
                } else if (patternRe && !(texture.getURI().match(patternRe) || texture.getName().match(patternRe))) {
                    logger.debug(`${prefix}: Skipping, excluded by "pattern" parameter.`);
                    return;
                }

                let srcImage = texture.getImage();
                let srcExtension = texture.getURI()
                    ? FileUtils.extension(texture.getURI())
                    : ImageUtils.mimeTypeToExtension(texture.getMimeType());
                const srcSize = texture.getSize();
                const srcBytes = srcImage ? srcImage.byteLength : null;

                if (!srcImage || !srcSize || !srcBytes) {
                    logger.warn(`${prefix}: Skipping, unreadable texture.`);
                    return;
                }

                // RESIZE: Resize textures using Sharp. KTX Software --width and --height
                // flags apply only for raw texture creation.
                // https://github.com/donmccurdy/glTF-Transform/issues/1348
                //
                // Minimum size on any dimension is 4px.
                // https://github.com/donmccurdy/glTF-Transform/issues/502

                if (options.resize || !isMultipleOfFour(srcSize[0]) || !isMultipleOfFour(srcSize[1])) {
                    const limitInputPixels = options.limitInputPixels;
                    const encoder = options.encoder;
                    const instance = encoder(srcImage, { limitInputPixels }).toFormat('png');
                    const srcSize = ImageUtils.getSize(srcImage, srcMimeType);

                    const dstSize = options.resize
                        ? Array.isArray(options.resize)
                            ? fitWithin(srcSize, options.resize)
                            : fitPowerOfTwo(srcSize, options.resize)
                        : srcSize;
                    dstSize[0] = ceilMultipleOfFour(dstSize[0]);
                    dstSize[1] = ceilMultipleOfFour(dstSize[1]);

                    logger.debug(`${prefix}: Resizing ${srcSize.join('x')} → ${dstSize.join('x')}px`);
                    instance.resize(dstSize[0], dstSize[1], { fit: 'fill', kernel: options.resizeFilter });

                    srcImage = BufferUtils.toView(await instance.toBuffer());
                    srcExtension = 'png';
                    srcMimeType = 'image/png';
                }

                // PREPARE: Create temporary in/out paths for the 'ktx' CLI tool, and determine
                // necessary command-line flags.

                const srcPath = join(batchDir, `${batchPrefix}_${textureIndex}.${srcExtension}`);
                const dstPath = join(batchDir, `${batchPrefix}_${textureIndex}.ktx2`);

                await fs.writeFile(srcPath, srcImage);

                const params = [
                    'create',
                    ...createParams(texture, slots, channels, numTextures, options),
                    srcPath,
                    dstPath,
                ];
                logger.debug(`${prefix}: Spawning → ktx ${params.join(' ')}`);

                // COMPRESS: Run `ktx create` CLI tool.
                const [status, _stdout, stderr] = await waitExit(spawn('ktx', params));

                if (status !== 0) {
                    logger.error(`${prefix}: Failed → \n\n${stderr.toString()}`);
                } else {
                    // PACK: Replace image data in the glTF asset.
                    texture.setImage(await fs.readFile(dstPath)).setMimeType('image/ktx2');
                    if (texture.getURI()) {
                        texture.setURI(FileUtils.basename(texture.getURI()) + '.ktx2');
                    }
                }
            }),
        );

        await Promise.all(promises);

        if (options.cleanup) {
            await rm(batchDir, { recursive: true });
        }

        const usesKTX2 = doc
            .getRoot()
            .listTextures()
            .some((t) => t.getMimeType() === 'image/ktx2');

        if (!usesKTX2) {
            basisuExtension.dispose();
        }
    });
};

/**********************************************************************************************
 * Utilities.
 */

/** Create CLI parameters from the given options. Attempts to write only non-default options. */
function createParams(
    texture,
    slots,
    channels,
    numTextures,
    options,
) {
    const colorSpace = getTextureColorSpace(texture);
    const params = ['--generate-mipmap'];

    if (options.filter !== GLOBAL_DEFAULTS.filter) {
        params.push('--mipmap-filter', options.filter);
    }

    if (options.filterScale !== GLOBAL_DEFAULTS.filterScale) {
        params.push('--mipmap-filter-scale', options.filterScale);
    }

    // See: https://github.com/KhronosGroup/KTX-Software/issues/600
    const isNormalMap = slots.find((slot) => /normal/i.test(slot));

    if (options.mode === Mode.UASTC) {
        const _options = options;
        params.push('--encode', 'uastc');
        params.push('--uastc-quality', _options.level);

        if (_options.rdo && !isNormalMap) {
            params.push('--uastc-rdo');
            if (_options.rdoLambda !== UASTC_DEFAULTS.rdoLambda) {
                params.push('--uastc-rdo-l', _options.rdoLambda);
            }
            if (_options.rdoDictionarySize !== UASTC_DEFAULTS.rdoDictionarySize) {
                params.push('--uastc-rdo-d', _options.rdoDictionarySize);
            }
            if (_options.rdoBlockScale !== UASTC_DEFAULTS.rdoBlockScale) {
                params.push('--uastc-rdo-b', _options.rdoBlockScale);
            }
            if (_options.rdoStdDev !== UASTC_DEFAULTS.rdoStdDev) {
                params.push('--uastc-rdo-s', _options.rdoStdDev);
            }
            if (!_options.rdoMultithreading) {
                params.push('--uastc-rdo-m');
            }
        }

        if (_options.zstd && _options.zstd > 0) {
            params.push('--zstd', _options.zstd);
        }
    } else {
        const _options = options;
        params.push('--encode', 'basis-lz');

        if (_options.quality !== ETC1S_DEFAULTS.quality) {
            params.push('--qlevel', _options.quality);
        }
        if (_options.compression !== ETC1S_DEFAULTS.compression) {
            params.push('--clevel', _options.compression);
        }
        if (_options.rdo && !isNormalMap) {
            if (_options.maxEndpoints !== ETC1S_DEFAULTS.maxEndpoints) {
                params.push('--max-endpoints', _options.maxEndpoints);
            }
            if (_options.maxSelectors !== ETC1S_DEFAULTS.maxSelectors) {
                params.push('--max-selectors', _options.maxSelectors);
            }
            if (_options.rdoThreshold !== ETC1S_DEFAULTS.rdoThreshold) {
                params.push('--endpoint-rdo-threshold', _options.rdoThreshold);
                params.push('--selector-rdo-threshold', _options.rdoThreshold);
            }
        } else {
            params.push('--no-endpoint-rdo', '--no-selector-rdo');
        }
    }

    // See: https://github.com/donmccurdy/glTF-Transform/issues/215
    if (colorSpace === 'srgb') {
        params.push('--assign-oetf', 'srgb', '--assign-primaries', 'bt709');
    } else if (colorSpace === 'srgb-linear') {
        params.push('--assign-oetf', 'linear', '--assign-primaries', 'bt709');
    } else if (slots.length && !colorSpace) {
        params.push('--assign-oetf', 'linear', '--assign-primaries', 'none');
    }

    if (channels === R) {
        params.push('--format', 'R8_UNORM');
    } else if (channels === G || channels === (R | G)) {
        params.push('--format', 'R8G8_UNORM');
    } else if (!(channels & A)) {
        params.push('--format', colorSpace === 'srgb' ? 'R8G8B8_SRGB' : 'R8G8B8_UNORM');
    } else {
        params.push('--format', colorSpace === 'srgb' ? 'R8G8B8A8_SRGB' : 'R8G8B8A8_UNORM');
    }

    if (options.jobs && options.jobs > 1 && numTextures > 1) {
        // See: https://github.com/donmccurdy/glTF-Transform/pull/389#issuecomment-1089842185
        const threads = Math.max(2, Math.min(NUM_CPUS, Math.round((3 * NUM_CPUS) / numTextures)));
        params.push('--threads', threads);
    }

    return params;
}

async function waitExit(process){
    let stdout = '';
    if (process.stdout) {
        for await (const chunk of process.stdout) {
            stdout += chunk;
        }
    }
    let stderr = '';
    if (process.stderr) {
        for await (const chunk of process.stderr) {
            stderr += chunk;
        }
    }
    const status = await new Promise((resolve, _) => {
        process.on('close', resolve);
    });
    return [status, stdout, stderr];
}

async function checkKTXSoftware(logger) {
    try {
        const [status] = await waitExit(spawn('ktx', ['--version']));
        if (status !== 0) {
            throw new Error('Command not found');
        }
    } catch (error) {
        throw new Error(
            `Command "ktx" not found. Please install KTX-Software ${KTX_SOFTWARE_VERSION_MIN}+, ` +
                'from:\n\nhttps://github.com/KhronosGroup/KTX-Software',
        );
    }

    const [status, stdout, stderr] = await waitExit(spawn('ktx', ['--version']));

    const version = ((stdout || stderr))
        .replace(/ktx version:\s+/, '')
        .replace(/~\d+/, '')
        .trim();

    if (status !== 0 || !version) {
        throw new Error(
            `Unable to find "ktx" version. Confirm KTX-Software ${KTX_SOFTWARE_VERSION_MIN}+ is installed.`,
        );
    } else {
        logger.debug(`ktx: Found KTX-Software ${version}.`);
    }

    return version;
}

function isMultipleOfFour(value) {
    return value % 4 === 0;
}

function ceilMultipleOfFour(value) {
    if (value <= 4) return 4;
    return value % 4 ? value + 4 - (value % 4) : value;
}

/// End toktx.ts

class CesiumRTC extends Extension {
	extensionName = 'CESIUM_RTC';
	static EXTENSION_NAME = 'CESIUM_RTC';

	read(context) {
        const rtc = context.jsonDoc.json.extensions?.CESIUM_RTC;
        if (rtc) {
            this.rtc = rtc;
        }
	}

	write(context) {
        if (this.rtc){
            context.jsonDoc.json.extensions = context.jsonDoc.json.extensions || {};
            context.jsonDoc.json.extensions.CESIUM_RTC = this.rtc;
        }
    }
}


async function main() {
    const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS)
                           .registerExtensions([CesiumRTC])
                           .registerDependencies({
                               'draco3d.decoder': await draco3d.createDecoderModule(),
                               'draco3d.encoder': await draco3d.createEncoderModule(),
                           });

    const args = process.argv.slice(2);
    let inputFile = '';
    let outputFile = '';
    let textureSize = 512;
    let simplifyRatio = 1;
    let textureCompression = 'auto';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' && i + 1 < args.length) {
            inputFile = args[i + 1];
            i++;
        } else if (args[i] === '--output' && i + 1 < args.length) {
            outputFile = args[i + 1];
            i++;
        } else if (args[i] === '--texture-compress' && i + 1 < args.length) {
            textureCompression = args[i + 1];
            i++;
            if (["auto", "ktx2"].indexOf(textureCompression) === -1){
                console.log(`Invalid texture compress: ${textureCompression}`);
                process.exit(1);
            }
        } else if (args[i] === '--texture-size' && i + 1 < args.length) {
            textureSize = parseInt(args[i + 1]);
            if (isNaN(textureSize) || textureSize < 1){
                console.log(`Invalid texture size: ${args[i + 1]}`);
                process.exit(1);
            }
            i++;
        } else if (args[i] === '--simplify-ratio' && i + 1 < args.length) {
            simplifyRatio = parseFloat(args[i + 1]);
            if (isNaN(simplifyRatio) || simplifyRatio < 0 || simplifyRatio > 1){
                console.log(`Invalid simplify ratio: ${args[i + 1]}`);
                process.exit(1);
            }
            i++;
        }

    }

    if (!inputFile || !outputFile){
        console.log('Usage: node glb_optimize.js --input <input.glb> --output <output.glb> [--texture-size <size>] [--simplify-ratio <ratio>] [--texture-compress <auto|ktx2>');
        process.exit(1);
    }

    const encoder = require('sharp');

    let transforms = [];
    if (simplifyRatio < 1){
        transforms.push(weld());
        transforms.push(
            simplify({
                simplifier: MeshoptSimplifier,
                error: 0.0001,
                ratio: simplifyRatio,
                lockBorder: false,
            }),
        );
    }

    const resize = [textureSize, textureSize];

    if (textureCompression === "ktx2"){
        const slotsUASTC = /(?:(normalTexture|occlusionTexture|metallicRoughnessTexture))/i;
        const tmpDirSuffix = uuid();
        const tmpDir = path.join((path.resolve(path.dirname(outputFile)), `tmp-${tmpDirSuffix}`));

        transforms.push(
            toktx({
                encoder,
                resize,
                mode: Mode.UASTC,
                slots: slotsUASTC,
                level: 4,
                rdo: true,
                rdoLambda: 4,
                limitInputPixels: true,
                tmpDir
            }),
            toktx({
                encoder,
                resize,
                mode: Mode.ETC1S,
                quality: 255,
                limitInputPixels: true,
                tmpDir
            }),
        );
    }else{
        transforms.push(textureCompress({
            encoder,
            resize,
            targetFormat: undefined,
            limitInputPixels: true,
        }));
    }
    
    transforms.push(draco({
        quantizationVolume: "scene"
    }));

    const document = await io.read(inputFile);
    await document.transform(...transforms);

    const outputDir = path.dirname(outputFile);
    try {
        await fs.access(outputDir);
        await io.write(outputFile, document);
    } catch (e){
        throw new Error(`Cannot write file to ${outputDir}: ${e}`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});