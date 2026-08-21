import React from 'react';
import './css/ModelView.scss';
import ErrorMessage from './components/ErrorMessage';
import SwitchModeButton from './components/SwitchModeButton';
import AssetDownloadButtons from './components/AssetDownloadButtons';
import Standby from './components/Standby';
import ShareButton from './components/ShareButton';
import ImagePopup from './components/ImagePopup';
import Utils from './classes/Utils';
import PropTypes from 'prop-types';
import PluginsAPI from './classes/plugins/API';
import update from 'immutability-helper';
import * as THREE from 'THREE';
import $ from 'jquery';
import { _, interpolate } from './classes/gettext';
import UnitSelector from './components/UnitSelector';
import { getUnitSystem, setUnitSystem, onUnitSystemChanged, offUnitSystemChanged } from './classes/Units';

require('./vendor/OBJLoader');
require('./vendor/MTLLoader');
require('./vendor/GLTFLoader');
require('./vendor/DRACOLoader');

class SetCameraView extends React.Component{
    static propTypes = {
        viewer: PropTypes.object.isRequired,
        task: PropTypes.object.isRequired
    }

    constructor(props){
        super(props);
        
        this.state = {
            error: "",
            showOk: false
        }
    }

    handleClick = () => {
        const { view } = Potree.saveProject(this.props.viewer);
        const showError = () => {
            this.setState({error: _("Cannot set initial camera view")});
            setTimeout(() => this.setState({error: ""}), 3000);
        };
        const showOk = () => {
            this.setState({showOk: true});
            setTimeout(() => this.setState({showOk: false}), 2000);
        }

        $.ajax({
            url: `/api/projects/${this.props.task.project}/tasks/${this.props.task.id}/3d/cameraview`,
            contentType: 'application/json',
            data: JSON.stringify(view),
            dataType: 'json',
            type: 'POST'
          }).done(result => {
            if (result.success) showOk();
            else showError();
          }).fail(() => {
            showError();
          });
    }

    render(){
        return ([<input key="btn" type="button" onClick={this.handleClick} 
                    style={{marginBottom: 12, display: 'inline-block'}} name="set_camera_view" 
                    value={_("set initial camera view")} />,
                this.state.showOk ? (<div key="ok" style={{color: 'lightgreen', display: 'inline-block', marginLeft: 12}}>✓</div>) : "",
                this.state.error ? (<div key="error" style={{color: 'red'}}>{this.state.error}</div>) : ""
                ]
        );
    }
}

class CamerasMenu extends React.Component{
    static propTypes = {
        toggleCameras: PropTypes.func.isRequired,
        changeCameraScale: PropTypes.func.isRequired
    }

    constructor(props){
        super(props);

        this.state = {
            showCameras: false
        }

        // Translations
        _("Cameras");
    }

    componentDidMount(){
        if (this.sldCameraSize){
            $(this.sldCameraSize).slider({
                min: 0.1, max: 4, step: 0.1,
                value: 1.0,
                slide: (event, ui) => {
                    this.props.changeCameraScale(ui.value);
                }
            });
        }
    }

    handleClick = (e) => {
        this.setState({showCameras: e.target.checked});
        this.props.toggleCameras(e);
    }

    render(){
        return (<div>
            <div><label><input type="checkbox" 
                    checked={this.state.showCameras}
                    onChange={this.handleClick}
                /> {_("Show Cameras")}</label>
            </div>
            <div style={{marginTop: 12}}>
                <span>{_("Size")}</span>
                <div ref={domNode => this.sldCameraSize = domNode}></div>
            </div>
            </div>);
    }
}

const CAMERA_SCALES = {
    'm': 1.0,
    'ft': 3.28,
    'US survey foot': 3.28
};

class ModelView extends React.Component {
  static defaultProps = {
    task: null,
    public: false,
    shareButtons: true,
    modelType: "cloud",
    title: ""
  };

  static propTypes = {
      task: PropTypes.object.isRequired, // The object should contain two keys: {id: <taskId>, project: <projectId>}
      public: PropTypes.bool, // Is the view being displayed via a shared link?
      shareButtons: PropTypes.bool,
      modelType: PropTypes.oneOf(['cloud', 'mesh', 'splats']),
      title: PropTypes.string
  };

  constructor(props){
    super(props);

    this.state = {
      error: "",
      showingTexturedModel: false,
      initializingModel: false,
      texModelLoadProgress: null,
      showingSplats: false,
      initializingSplats: false,
      splatsLoadProgress: null,
      selectedCamera: null,
      modalOpen: false,
      sidebarOpen: false,
      cameraScale: CAMERA_SCALES[props.task.srs.units] || 1.0,
      pluginActionButtons: []
    };

    this.pointCloud = null;
    this.modelReference = null;
    this.splatsReference = null;
    this.sparkRenderer = null;

    this.cameraMeshes = [];
  }

  basePath = () => {
    return `/api/projects/${this.props.task.project}/tasks/${this.props.task.id}`;
  }

  assetsPath = () => {
    return `${this.basePath()}/assets`;
  }

  urlExists = (url, cb) => {
    $.ajax({
        url: url,
        type:'HEAD',
        error: () => {
            cb(false);
        },
        success: () => {
            cb(true);
        }
    });
  }

  loadGeoreferencingOffset = (cb) => {
    const geoFile = `${this.assetsPath()}/odm_georeferencing/coords.txt`;
    const legacyGeoFile = `${this.assetsPath()}/odm_georeferencing/odm_georeferencing_model_geo.txt`;
    const getGeoOffsetFromUrl = (url) => {
        $.ajax({
            url: url,
            type: 'GET',
            error: () => {
                console.warn(`Cannot find ${url} (not georeferenced?)`);
                cb({x: 0, y: 0});
            },
            success: (data) => {
                const lines = data.split("\n");
                if (lines.length >= 2){
                    const [ x, y ] = lines[1].split(" ").map(parseFloat);
                    cb({x, y});
                }else{
                    console.warn(`Malformed georeferencing file: ${data}`);
                    cb({x: 0, y: 0});
                }
            }
        });
    };

    $.ajax({
        type: "HEAD",
        url: legacyGeoFile
    }).done(() => {
        // If a legacy georeferencing file is present
        // we'll use that
        getGeoOffsetFromUrl(legacyGeoFile);
    }).fail(() => {
        getGeoOffsetFromUrl(geoFile);
    });

    
  }

  pointCloudFilePath = (cb) => {
    // Check if entwine point cloud exists, 
    // otherwise fallback to potree point cloud binary format path
    const entwinePointCloud = this.assetsPath() + '/entwine_pointcloud/ept.json';
    const potreePointCloud = this.assetsPath() + '/potree_pointcloud/cloud.js';

    this.urlExists(entwinePointCloud, (exists) => {
        if (exists) cb(entwinePointCloud);
        else cb(potreePointCloud);
    });
  }

  texturedModelDirectoryPath = () => {
    return this.assetsPath() + '/odm_texturing/';
  }

  hasGeoreferencedAssets = () => {
    return this.props.task.available_assets.indexOf('orthophoto.tif') !== -1;
  }

  hasTexturedModel = () => {
    return this.props.task.available_assets.indexOf('textured_model.zip') !== -1;
  }

  getTexturedModelType = () => {
    if (this.props.task.available_assets.indexOf('textured_model.glb') !== -1) return 'gltf';
    else return 'obj';
  }

  hasCameras = () => {
    return this.props.task.available_assets.indexOf('shots.geojson') !== -1;
  }

  hasSplats = () => {
    return this.props.task.available_assets.indexOf('splats.rad') !== -1;
  }

  objFilePath = (cb) => {
    // Mostly for backward compatibility
    // as newer versions of ODX do not have 
    // a odm_textured_model.obj
    const geoUrl = this.texturedModelDirectoryPath() + 'odm_textured_model_geo.obj';
    const nongeoUrl = this.texturedModelDirectoryPath() + 'odm_textured_model.obj';

    $.ajax({
        type: "HEAD",
        url: geoUrl
    }).done(() => {
        cb(geoUrl);
    }).fail(() => {
        cb(nongeoUrl);
    });
  }

  glbFilePath = () => {
    let url = this.basePath() + '/textured_model/';
    
    if (Utils.isIOS()) url += "?platform=ios";
    else if (Utils.isMobile()) url += "?platform=mobile";
    
    return url;
  }

  mtlFilename = (cb) => {
    // Mostly for backward compatibility
    // as newer versions of ODX do not have 
    // a odm_textured_model.mtl
    const geoUrl = this.texturedModelDirectoryPath() + 'odm_textured_model_geo.mtl';

    $.ajax({
        type: "HEAD",
        url: geoUrl
    }).done(() => {
        cb("odm_textured_model_geo.mtl");
    }).fail(() => {
        cb("odm_textured_model.mtl");
    });
  }

  getSceneData(){
      let json = Potree.saveProject(window.viewer);

      // Remove view, settings since we don't want to trigger
      // scene updates when these change.
      delete json.view;
      delete json.settings;
      delete json.cameraAnimations;

      return json;
  }

  componentDidMount() {
    let container = this.container;
    if (!container) return; // Enzyme tests don't have support for all WebGL methods so we just skip this

    window.viewer = new Potree.Viewer(container);
    viewer.setEDLEnabled(true);
    viewer.setFOV(60);

    // Potree signals the sidebar state by setting the "left" offset
    // of the render area (0px when closed, 300px when open)
    this.sidebarObserver = new MutationObserver(() => {
        const sidebarOpen = container.style.left !== "" && container.style.left !== "0px";
        if (sidebarOpen !== this.state.sidebarOpen) this.setState({sidebarOpen});
    });
    this.sidebarObserver.observe(container, {attributes: true, attributeFilter: ['style']});

    if (Utils.isIOS()){
        viewer.setPointBudget(1000*1000);
    }else if (Utils.isMobile()){
        viewer.setPointBudget(2*1000*1000);
    }else{
        viewer.setPointBudget(10*1000*1000);
    }
    viewer.setEDLEnabled(true);
    viewer.loadSettingsFromURL();

    const origSetUnit = viewer.setLengthUnitAndDisplayUnit;
    onUnitSystemChanged(this.handleUnitSystemChanged);

    viewer.setLengthUnitAndDisplayUnit = (lengthUnit, displayUnit) => {
        if (displayUnit === 'm') setUnitSystem('metric');
        else if (displayUnit === 'ft') setUnitSystem("imperial");
        else if (displayUnit === 'ft (US)') setUnitSystem("imperialUS");

        origSetUnit.call(viewer, lengthUnit, displayUnit);
    };
        
    viewer.loadGUI(() => {
      viewer.setLanguage('en');
      $("#menu_tools").next().show();

    // Don't open sidebar on small screens
    if (window.innerWidth > 600) {
        viewer.toggleSidebar();
    }

      if (this.hasCameras()){
          window.ReactDOM.render(<CamerasMenu 
                toggleCameras={this.toggleCameras}
                changeCameraScale={this.changeCameraScale}
            />, $("#cameras_button").get(0));
      }else{
          $("#cameras").hide();
          $("#cameras_container").hide();
      }

      if (!this.props.public){
          const $scv = $("<div id='set-camera-view'></div>");
          $scv.prependTo($("#scene_export").parent());
          window.ReactDOM.render(<SetCameraView viewer={viewer} task={this.props.task} />, $scv.get(0));
      }
    });

    viewer.scene.scene.add( new THREE.AmbientLight( 0x404040, 2.0 ) ); // soft white light );
    viewer.scene.scene.add( new THREE.DirectionalLight( 0xcccccc, 0.5 ) );

    const directional = new THREE.DirectionalLight( 0xcccccc, 0.5 );
    directional.position.z = 99999999999;
    viewer.scene.scene.add( directional );

    this.pointCloudFilePath(pointCloudPath =>{ 
        Potree.loadPointCloud(pointCloudPath, "Point Cloud", e => {
          if (e.type == "loading_failed"){
            this.setState({error: "Could not load point cloud. This task doesn't seem to have one. Try processing the task again."});
            return;
          }
          
          // Set crop vertices if needed
          e.pointcloud.material.cropVertices = this.getCropCoordinates();

          // Automatically load 3D model if required
          if (this.hasTexturedModel() && this.props.modelType === "mesh"){
            this.toggleTexturedModel(true);
          }else if (this.hasSplats() && this.props.modelType === "splats"){
            this.toggleSplats(true);
          }
    
          let scene = viewer.scene;
          scene.addPointCloud(e.pointcloud);
          this.pointCloud = e.pointcloud;
    
          let material = e.pointcloud.material;
          material.size = 1;

          viewer.fitToScreen();
        
          this.handleUnitSystemChanged();

          // Load saved scene (if any)
          $.ajax({
              type: "GET",
              url: `/api/projects/${this.props.task.project}/tasks/${this.props.task.id}/3d/scene`
          }).done(sceneData => {
            let localSceneData = Potree.saveProject(viewer);

            // Check if we do not have a view set
            // if so, just keep the current view information
            if (!sceneData.view || !sceneData.view.position){
                sceneData.view = localSceneData.view;
            }

            const keepKeys = ['pointclouds', 'settings', 'cameraAnimations'];
            for (let k of keepKeys){
                sceneData[k] = localSceneData[k];
            }
            
            for (let k in localSceneData){
                if (keepKeys.indexOf(k) === -1){
                    sceneData[k] = sceneData[k] || localSceneData[k];
                }
            }

            // Load
            const potreeLoadProject = () => {
                Potree.loadProject(viewer, sceneData);
                viewer.removeEventListener("update", potreeLoadProject);
            };
            viewer.addEventListener("update", potreeLoadProject);

            // Every 3 seconds, check if the scene has changed
            // if it has, save the changes server-side
            // Unfortunately Potree does not have reliable events
            // for trivially detecting changes in measurements
            let saveSceneReq = null;
            let saveSceneInterval = null;
            let saveSceneErrors = 0;
            let prevSceneData = JSON.stringify(this.getSceneData());
            
            const postSceneData = (sceneData) => {
                if (saveSceneReq){
                    saveSceneReq.abort();
                    saveSceneReq = null;
                }
    
                saveSceneReq = $.ajax({
                    url: `/api/projects/${this.props.task.project}/tasks/${this.props.task.id}/3d/scene`,
                    contentType: 'application/json',
                    data: sceneData,
                    dataType: 'json',
                    type: 'POST'
                    }).done(result => {
                        if (result.success){
                            saveSceneErrors = 0;
                            prevSceneData = sceneData;
                        }else{
                            console.warn("Cannot save Potree scene");
                        }
                    }).fail(() => {
                        console.error("Cannot save Potree scene");
                        if (++saveSceneErrors === 5) clearInterval(saveSceneInterval);
                    });
            };

            const checkScene = () => {
                const sceneData = JSON.stringify(this.getSceneData());
                if (sceneData !== prevSceneData) postSceneData(sceneData);
                
                // Potree is a bit strange, sometimes fitToScreen does
                // not work, so we check whether the camera position is still
                // at zero and recall fitToScreen
                const pos = viewer.scene.view.position;
                if (pos.x === 0 && pos.y === 0 && pos.z === 0) viewer.fitToScreen();
            };

            saveSceneInterval = setInterval(checkScene, 3000);
          }).fail(e => {
            console.error("Cannot load 3D scene information", e);
          });
        });
    });

    viewer.renderer.domElement.addEventListener( 'mousedown', this.handleRenderMouseClick );
    viewer.renderer.domElement.addEventListener( 'mousemove', this.handleRenderMouseMove );
    viewer.renderer.domElement.addEventListener( 'touchstart', this.handleRenderTouchStart );
    
    PluginsAPI.ModelView.triggerAddActionButton({
      viewer
    }, (button) => {
      this.setState(update(this.state, {
        pluginActionButtons: {$push: [button]}
      }));
    });
  }

  handleUnitSystemChanged = () => {
    if (!window.viewer) return;

    const us = getUnitSystem();
    
    // GDAL --> Potree
    const UNIT_MAP = { 
        'm': 'm',
        'ft': 'ft',
        'US survey foot': 'ft (US)'
    };

    const dsUnit = UNIT_MAP[this.props.task.srs.units] || 'm';

    if (us === 'metric'){
        window.viewer.setLengthUnitAndDisplayUnit(dsUnit, 'm');
    }else if (us === 'imperial'){
        window.viewer.setLengthUnitAndDisplayUnit(dsUnit, 'ft');
    }else if (us === 'imperialUS'){
        window.viewer.setLengthUnitAndDisplayUnit(dsUnit, 'ft (US)');
    }
  }

  getCropCoordinates(){
    if (this.props.task.crop_projected && this.props.task.crop_projected.length >= 3){
        return this.props.task.crop_projected.map(coord => {
            return new THREE.Vector3(coord[0], coord[1], 0.0);
        });
    }
  }

  componentWillUnmount(){
    offUnitSystemChanged(this.handleUnitSystemChanged);
    if (this.splatsRAF !== undefined){
        cancelAnimationFrame(this.splatsRAF);
        this.splatsRAF = undefined;
    }
    if (this.sidebarObserver) this.sidebarObserver.disconnect();
    viewer.renderer.domElement.removeEventListener( 'mousedown', this.handleRenderMouseClick );
    viewer.renderer.domElement.removeEventListener( 'mousemove', this.handleRenderMouseMove );
    viewer.renderer.domElement.removeEventListener( 'touchstart', this.handleRenderTouchStart );
    
  }

  getCameraUnderCursor = (evt) => {
    const raycaster = new THREE.Raycaster();
    const rect = viewer.renderer.domElement.getBoundingClientRect();
    const [x, y] = [evt.clientX, evt.clientY];
    const array = [ 
        ( x - rect.left ) / rect.width, 
        ( y - rect.top ) / rect.height 
    ];
    const onClickPosition = new THREE.Vector2(...array);
    const camera = viewer.scene.getActiveCamera();
    const mouse = new THREE.Vector3(
        + ( onClickPosition.x * 2 ) - 1, 
        - ( onClickPosition.y * 2 ) + 1 );
    raycaster.setFromCamera( mouse, camera );
    const intersects = raycaster.intersectObjects( this.cameraMeshes );

    if ( intersects.length > 0){
        const intersection = intersects[0];
        return intersection.object.parent.parent;
    }
  }

  setCameraOpacity(camera, opacity){
    camera.traverse(obj => {
        if (obj.material) obj.material.opacity = opacity;
    });
  }

  handleRenderMouseMove = (evt) => {
    if (this._prevCamera && this._prevCamera !== this.state.selectedCamera) {
        this.setCameraOpacity(this._prevCamera, 0.7);
    }

    const camera = this.getCameraUnderCursor(evt);
    if (camera){
        viewer.renderer.domElement.classList.add("pointer-cursor");
        this.setCameraOpacity(camera, 1);
    }else{
        viewer.renderer.domElement.classList.remove("pointer-cursor");
    }
    this._prevCamera = camera;
  }

  handleRenderTouchStart = (evt) => {
    if (evt.touches.length === 1){
        this.handleRenderMouseClick({clientX: evt.touches[0].clientX, clientY: evt.touches[0].clientY});
    }
  }

  handleRenderMouseClick = (evt) => {
    let camera = this.getCameraUnderCursor(evt);
    // Deselect
    if (camera === this.state.selectedCamera){
        this.setState({selectedCamera: null});
    }else if (camera){
        if (this.state.selectedCamera){
            this.setCameraOpacity(this.state.selectedCamera, 0.7);
        }
        this.setState({selectedCamera: camera});
    }
  }

  closeThumb = (e) => {
    e.stopPropagation();
    this.setState({selectedCamera: null});
  }

  loadCameras(){
    const { task } = this.props;

    function getMatrix(translation, rotation, scale) {
        var axis = new THREE.Vector3(-rotation[0],
                                    -rotation[1],
                                    -rotation[2]);
        var angle = axis.length();
        axis.normalize();
        var matrix = new THREE.Matrix4().makeRotationAxis(axis, angle);
        matrix.setPosition(new THREE.Vector3(translation[0], translation[1], translation[2]));
        
        if (scale != 1.0){
            matrix.scale(new THREE.Vector3(scale, scale, scale));
        }

        return matrix.transpose();
    }

    if (this.hasCameras()){
        const fileloader = new THREE.FileLoader();
        
        this.loadGltf('/static/app/models/camera.glb', (err, gltf) => {
            if (err){
                console.error(err);
                return;
            }

            const cameraObj = gltf.scene;

            fileloader.load(`/api/projects/${task.project}/tasks/${task.id}/download/shots.geojson`,  ( data ) => {
                const geojson = JSON.parse(data);
                cameraObj.traverse(obj => {
                    if (obj.material){
                        obj.material.transparent = true; 
                        obj.material.opacity = 0.7;
                    }
                });
                
                let i = 0;
                geojson.features.forEach(feat => {
                    const cameraMesh = cameraObj.clone();
                    cameraMesh.traverse((node) => {
                        if (node.isMesh) {
                            node.material = node.material.clone();
                        }
                    });

                    cameraMesh.matrixAutoUpdate = false;
                    let scale = this.state.cameraScale;
                    // if (!this.pointCloud.projection) scale = 0.1;

                    cameraMesh.matrix.set(...getMatrix(feat.properties.translation, feat.properties.rotation, scale).elements);
                    
                    viewer.scene.scene.add(cameraMesh);

                    cameraMesh._feat = feat;
                    this.cameraMeshes.push(cameraMesh.children[0].children[1]);

                    i++;
                });
            }, undefined, console.error);
        });
    }
  }

  setPointCloudsVisible = (flag) => {
    viewer.setEDLEnabled(true);
    
    // Using opacity we can still perform measurements
    viewer.setEDLOpacity(flag ? 1 : 0);

    // On mobile, for performance and because opacity doesn't
    // seem to work consistently, we remove the ability to do
    // measurements
    if (Utils.isMobile()){
        for(let pointcloud of viewer.scene.pointclouds){
            pointcloud.visible = flag;
        }
    }
  }

  toggleCameras = (e) => {
    if (this.cameraMeshes.length === 0){
        this.loadCameras();
        if (this.cameraMeshes.length === 0) return;
    }

    const isVisible = this.cameraMeshes[0].visible;
    this.cameraMeshes.forEach(cam => {
        cam.visible = !isVisible;
        cam.parent.visible = cam.visible;
    });
  }

  changeCameraScale = (value) => {
    if (this.cameraMeshes.length === 0) return;

    this.cameraMeshes.forEach(cam => {
        cam.parent.scale.setScalar(value);
    });
  }

  loadGltf = (url, cb, onProgress) => {
    if (!this.gltfLoader) this.gltfLoader = new THREE.GLTFLoader();
    if (!this.dracoLoader) {
        this.dracoLoader = new THREE.DRACOLoader();
        this.dracoLoader.setDecoderPath( '/static/app/js/vendor/draco/' );
        this.gltfLoader.setDRACOLoader( this.dracoLoader );
    }

    // Load a glTF resource
    this.gltfLoader.load(url,
        gltf => { cb(null, gltf) },
        onProgress,
        error => { cb(error); },
        {crop: this.getCropCoordinates()}
    );
  }

  getCurrentModelType = () => {
    if (this.state.showingTexturedModel || this.state.initializingModel) return "mesh";
    if (this.state.showingSplats || this.state.initializingSplats) return "splats";
    return "cloud";
  }

  setModelType = (type) => {
    if (this.state.initializingModel || this.state.initializingSplats) return;

    const current = this.getCurrentModelType();
    if (current === type) return;

    if (current === "mesh") this.toggleTexturedModel(false);
    else if (current === "splats") this.toggleSplats(false);

    if (type === "mesh") this.toggleTexturedModel(true);
    else if (type === "splats") this.toggleSplats(true);
  }

  loadSplatsModule = (cb) => {
    if (window.THREEdgs){
        cb();
        return;
    }

    $.ajax({
        url: "/static/app/js/vendor/threedgs.umd.js",
        dataType: "script",
        cache: true
    }).done(() => {
        if (window.THREEdgs) cb();
        else cb(new Error(_("Cannot load splats renderer")));
    }).fail(() => {
        cb(new Error(_("Cannot load splats renderer")));
    });
  }

  initSplatsRenderer = () => {
    // Potree's renderer runs on a WebGL1 context, but gaussian splats
    // require WebGL2, so we render them on a separate canvas placed
    // behind Potree's (which clears to transparent when the background
    // is set to null) and sync the camera every frame.
    this.splatsRenderer = new THREE.WebGLRenderer({alpha: true, antialias: false});
    this.splatsRenderer.setClearColor(0x000000, 0);

    const canvas = this.splatsRenderer.domElement;
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    // Mimic Potree's gradient background
    canvas.style.background = "radial-gradient(ellipse at center, rgb(31, 46, 52) 0%, rgb(13, 19, 22) 100%)";

    const renderArea = viewer.renderer.domElement.parentElement;
    renderArea.insertBefore(canvas, renderArea.firstChild);

    this.splatsScene = new THREE.Scene();
    this.splatsCamera = new THREE.PerspectiveCamera();
    this.splatsCamera.matrixAutoUpdate = false;

    // Separate camera for Potree's orthographic mode; the splats renderer
    // relies on the camera type for both shading and LOD calculations
    this.splatsCameraOrtho = new THREE.OrthographicCamera();
    this.splatsCameraOrtho.matrixAutoUpdate = false;

    this.sparkRenderer = new THREEdgs.SparkRenderer({renderer: this.splatsRenderer});
    this.splatsScene.add(this.sparkRenderer);
  }

  renderSplatsLoop = () => {
    this.splatsRAF = requestAnimationFrame(this.renderSplatsLoop);

    // Loading a saved scene can restore the background at any time;
    // it must stay null (transparent) while splats are displayed
    if (!this._splatsWarmup && viewer.background !== null){
        this._prevBackground = viewer.background;
        viewer.setBackground(null);
    }

    const pCanvas = viewer.renderer.domElement;
    const canvas = this.splatsRenderer.domElement;
    if (canvas.width !== pCanvas.width || canvas.height !== pCanvas.height){
        this.splatsRenderer.setSize(pCanvas.width, pCanvas.height, false);
    }

    // Copy Potree's camera, subtracting the georeferencing offset
    // (the splat model is kept in local coordinates to avoid float32
    // precision issues at UTM coordinate magnitudes)
    const cam = viewer.scene.getActiveCamera();
    const sc = cam.isOrthographicCamera ? this.splatsCameraOrtho : this.splatsCamera;
    sc.matrixWorld.copy(cam.matrixWorld);
    sc.matrixWorld.elements[12] -= this.splatsOffset.x;
    sc.matrixWorld.elements[13] -= this.splatsOffset.y;

    // The splats renderer calls getWorldPosition()/getWorldDirection()
    // on the camera to drive splat sorting and LOD, which recompose
    // matrixWorld from the local transform, so the local transform
    // must be kept in sync
    sc.matrix.copy(sc.matrixWorld);
    sc.matrix.decompose(sc.position, sc.quaternion, sc.scale);

    sc.matrixWorldInverse.copy(sc.matrixWorld).invert();

    if (cam.isOrthographicCamera){
        sc.left = cam.left;
        sc.right = cam.right;
        sc.top = cam.top;
        sc.bottom = cam.bottom;
        sc.zoom = cam.zoom;
        sc.near = cam.near;
        sc.far = cam.far;
        sc.updateProjectionMatrix();
    }else{
        sc.fov = cam.fov;
        sc.aspect = cam.aspect;

        // Potree grows the near plane dynamically based on the visible
        // point cloud nodes (potentially by several meters), which would
        // clip out splats close to the camera; use a fixed one instead
        sc.near = 0.1;
        sc.far = cam.far;
        sc.updateProjectionMatrix();
    }

    this.splatsRenderer.render(this.splatsScene, sc);

    // Sorting/uploading splats to the GPU takes a few frames after load;
    // keep the loading standby up until the first frame with actual
    // content has been rendered
    if (this._splatsWarmup){
        this._splatsWarmupFrame = (this._splatsWarmupFrame || 0) + 1;
        if (this._splatsWarmupFrame % 5 === 0){
            if (this.splatsFrameHasContent() || performance.now() - this._splatsWarmupStart > 20000){
                this._splatsWarmup = false;
                this.setSplatsVisible(true);
                this.setPointCloudsVisible(false);
                this.setState({
                    initializingSplats: false,
                    showingSplats: true
                });
            }
        }
    }
  }

  splatsFrameHasContent = () => {
    const gl = this.splatsRenderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    for (let i = 3; i < buf.length; i += 1009 * 4){
        if (buf[i] > 8) return true;
    }
    return false;
  }

  setSplatsVisible = (flag) => {
    if (flag){
        this.splatsRenderer.domElement.style.display = "";
        if (this.splatsRAF === undefined) this.renderSplatsLoop();
    }else{
        if (this.splatsRAF !== undefined){
            cancelAnimationFrame(this.splatsRAF);
            this.splatsRAF = undefined;
        }
        this.splatsRenderer.domElement.style.display = "none";
        if (this._prevBackground !== undefined){
            viewer.setBackground(this._prevBackground);
            this._prevBackground = undefined;
        }
    }
  }

  toggleSplats = (show) => {
    if (show){
      // Need to load splats for the first time?
      if (this.splatsReference === null && !this.state.initializingSplats){

        this.setState({initializingSplats: true, splatsLoadProgress: null});

        this.loadSplatsModule(err => {
            if (err){
                this.setState({initializingSplats: false, error: err.message});
                return;
            }

            if (!this.splatsRenderer) this.initSplatsRenderer();

            const url = this.assetsPath() + '/splats/model.rad';
            const splats = new THREEdgs.SplatMesh({
                url,
                paged: true,
                onProgress: e => {
                    if (e.lengthComputable){
                        this.setState({splatsLoadProgress: Math.round((e.loaded / e.total) * 100)});
                    }
                },
                onLoad: () => {
                    this.setState({splatsLoadProgress: null});
                    this.loadGeoreferencingOffset((offset) => {
                        this.splatsOffset = offset;

                        const cropCoords = this.getCropCoordinates();
                        if (cropCoords){
                            this.sparkRenderer.cropVertices = cropCoords.map(v => new THREE.Vector2(v.x - offset.x, v.y - offset.y));
                        }

                        this.splatsScene.add(splats);
                        this.splatsReference = splats;

                        // Start rendering (hidden behind Potree's opaque
                        // canvas); renderSplatsLoop reveals the splats and
                        // clears the standby once the first frame is ready
                        this._splatsWarmup = true;
                        this._splatsWarmupStart = performance.now();
                        if (this.splatsRAF === undefined) this.renderSplatsLoop();
                    });
                }
            });

            splats.initialized.catch(e => {
                console.error(e);
                this.setState({initializingSplats: false, error: _("Could not load splats. This task doesn't seem to have a valid splats file.")});
            });
        });
      }else{
        // Already initialized
        this.setSplatsVisible(true);
        this.setPointCloudsVisible(false);
        this.setState({showingSplats: true});
      }
    }else{
      this.setSplatsVisible(false);
      this.setPointCloudsVisible(true);
      this.setState({showingSplats: false});
    }
  }

  toggleTexturedModel = (show) => {
    if (show){
      // Need to load model for the first time?
      if (this.modelReference === null && !this.state.initializingModel){

        this.setState({initializingModel: true});

        const addObject = (object, offset) => {
            object.translateX(offset.x);
            object.translateY(offset.y);

            viewer.scene.scene.add(object);

            this.modelReference = object;
            this.setPointCloudsVisible(false);

            this.setState({
                initializingModel: false,
                showingTexturedModel: true
            });
        }

        if (this.getTexturedModelType() === 'gltf'){
            this.loadGltf(this.glbFilePath(), (err, gltf) => {
                if (err){
                    this.setState({initializingModel: false, error: err});
                    return;
                }
                this.setState({texModelLoadProgress: null});
                
                setTimeout(() => {
                    const offset = {x: 0, y: 0};
                    if (gltf.scene.CESIUM_RTC && gltf.scene.CESIUM_RTC.center){
                        offset.x = gltf.scene.CESIUM_RTC.center[0];
                        offset.y = gltf.scene.CESIUM_RTC.center[1];
                    }
    
                    addObject(gltf.scene, offset);
                }, 0);
            }, xhr => {
                const progress = Math.round((xhr.loaded / xhr.total) * 100);
                this.setState({texModelLoadProgress: progress});
            });
        }else{
            // Legacy OBJ

            const mtlLoader = new THREE.MTLLoader();
            mtlLoader.setPath(this.texturedModelDirectoryPath());
    
            this.mtlFilename(mtlPath => {
                mtlLoader.load(mtlPath, (materials) => {
                    materials.preload();
        
                    const objLoader = new THREE.OBJLoader();
                    objLoader.setMaterials(materials);
                    this.objFilePath(filePath => {
                        objLoader.load(filePath, (object) => {
                            this.loadGeoreferencingOffset((offset) => {
                                addObject(object, offset);
                            });
                        });
                    });
                });
            });
        }
      }else{
        // Already initialized
        this.modelReference.visible = true;
        this.setPointCloudsVisible(false);
        this.setState({showingTexturedModel: true});
      }
    }else{
      this.modelReference.visible = false;
      this.setPointCloudsVisible(true);
      this.setState({showingTexturedModel: false});
    }
  }

  // React render
  render(){
    const { selectedCamera, showingTexturedModel, initializingModel, showingSplats, initializingSplats } = this.state;
    const { task } = this.props;
    const queryParams = {};
    if (showingTexturedModel){
        queryParams.t = "mesh";
    }else if (showingSplats){
        queryParams.t = "splats";
    }

    let modelTypeButtons = [
      {
        label: _("Point Cloud"),
        type: "cloud",
        icon: "fa fa-pointcloud"
      }
    ];
    if (this.hasTexturedModel()){
      modelTypeButtons.push({
        label: _("Textured Model"),
        type: "mesh",
        icon: "fab fa-connectdevelop"
      });
    }
    if (this.hasSplats()){
      modelTypeButtons.push({
        label: _("Splats"),
        type: "splats",
        icon: "fa fa-splat"
      });
    }

    // If we have only one type available, hide the buttons
    if (modelTypeButtons.length === 1) modelTypeButtons = [];

    const selectedModelType = this.getCurrentModelType();
    const initializing = initializingModel || initializingSplats;

    return (<div className={"model-view " + (this.state.sidebarOpen ? "sidebar-open" : "")}>
          <ErrorMessage bind={[this, "error"]} />

          {(this.props.title || modelTypeButtons.length > 0) ?
          <div className="model-view-header">
            {this.props.title ?
              <h3 className="model-title" title={this.props.title}><i className="fa fa-cube"></i> {this.props.title}</h3>
            : ""}

            <div className="model-type-selector btn-group" role="group">
              {modelTypeButtons.map(modelType =>
                <button
                  key={modelType.type}
                  onClick={() => this.setModelType(modelType.type)}
                  disabled={initializing}
                  title={modelType.label}
                  className={"btn btn-sm " + (modelType.type === selectedModelType ? "btn-primary" : "btn-default")}><i className={modelType.icon + " fa-fw"}></i><span className="hidden-sm hidden-xs"> {modelType.label}</span></button>
              )}
            </div>
          </div>
          : ""}

          <div className="container potree_container"
             style={{width: "100%", position: "relative"}}
             onContextMenu={(e) => {e.preventDefault();}}>
                <div id="potree_render_area"
                    ref={(domNode) => { this.container = domNode; }}></div>
                <div id="potree_sidebar_container"> </div>

                <Standby
                  message={initializingSplats ? _("Loading splats...") : _("Loading textured model...")}
                  show={initializing}
                  progress={initializingSplats ? this.state.splatsLoadProgress : this.state.texModelLoadProgress}
                  />
          </div>

          <div className={"model-action-buttons " + (this.state.modalOpen ? "modal-open" : "")}>
            <UnitSelector />
            <AssetDownloadButtons 
                            task={this.props.task} 
                            direction="up" 
                            showLabel={false}
                            buttonClass="btn-secondary"
                            onModalOpen={() => this.setState({modalOpen: true})}
                            onModalClose={() => this.setState({modalOpen: false})} />
            {this.state.pluginActionButtons.map((button, i) => <div key={i}>{button}</div>)}
            {(this.props.shareButtons && !this.props.public) ? 
            <ShareButton 
                ref={(ref) => { this.shareButton = ref; }}
                task={this.props.task} 
                popupPlacement="top"
                linksTarget="3d"
                queryParams={queryParams}
            />
            : ""}
            <SwitchModeButton 
                public={this.props.public}
                task={this.props.task}
                type="modelToMap" />
        </div>

        {selectedCamera ? <div className="thumbnail">
            <a className="close-thumb" href="javascript:void(0)" onClick={this.closeThumb}><i className="fa fa-window-close"></i></a>
            <ImagePopup feature={selectedCamera._feat} task={task} />
        </div> : ""}
      </div>);
  }
}

$(function(){
    // Use gettext for translations
    const oldInit = i18n.init;
    i18n.addPostProcessor("gettext", function(v, k, opts){
        if (v){
            return _(v);
        }else return v;
    });
    i18n.init = function(opts, cb){
        opts.preload = ['en'];
        opts.postProcess = "gettext";
        oldInit(opts, cb);
    };

    $("[data-modelview]").each(function(){
        let props = $(this).data();
        delete(props.modelview);
        window.ReactDOM.render(<ModelView {...props}/>, $(this).get(0));
    });
});

export default ModelView;