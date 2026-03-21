import React from 'react';
import PropTypes from 'prop-types';
import '../css/MediaView.scss';
import { _ } from '../classes/gettext';
import Utils from '../classes/Utils';

class MediaView extends React.Component {
    static propTypes = {
        basePath: PropTypes.string.isRequired,
        media: PropTypes.object.isRequired
    };

    constructor(props) {
        super(props);

        this.ref = React.createRef();

        this.state = {
            error: "",
            visible: false,
            loading: true,
            expandThumb: false,

            translateX: 0,
            translateY: 0,
            scale: 1,
            dragging: false
        }

        this.registeredEvents = false;
    }

    getImageUrl() {
        return `${this.props.basePath}/download/${encodeURIComponent(this.props.media.filename)}`;
    }

    getThumbUrl() {
        return `${this.props.basePath}/thumbnail/${encodeURIComponent(this.props.media.filename)}?size=256`;
    }

    componentDidMount() {
        this.observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setTimeout(() => {
                        if (this.image && !this.registeredEvents) {
                            this.image.addEventListener("wheel", this.onMouseWheel);
                            this.image.addEventListener("mousedown", this.onMouseDown);
                            this.image.addEventListener("mousemove", this.onMouseMove);
                            this.image.addEventListener("mouseup", this.onMouseUp);
                            this.image.addEventListener("touchstart", this.onTouchStart);
                            this.image.addEventListener("touchmove", this.onTouchMove);
                            this.image.addEventListener("touchend", this.onTouchEnd);
                            this.registeredEvents = true;
                        }
                    }, 0);
                    this.setState({ visible: true });
                    this.observer.disconnect();
                }
            }
        );
        if (this.ref.current) this.observer.observe(this.ref.current);
    }

    componentWillUnmount() {
        if (this.observer) this.observer.disconnect();

        if (this.image) {
            this.image.removeEventListener("wheel", this.onMouseWheel);
            this.image.removeEventListener("mousedown", this.onMouseDown);
            this.image.removeEventListener("mousemove", this.onMouseMove);
            this.image.removeEventListener("mouseup", this.onMouseUp);
            this.image.removeEventListener("touchstart", this.onTouchStart);
            this.image.removeEventListener("touchmove", this.onTouchMove);
            this.image.removeEventListener("touchend", this.onTouchEnd);
            this.registeredEvents = false;
        }

        if (this.panoViewer) {
            this.panoViewer.destroy();
            this.panoViewer = null;
        }

        this.closeVideoViewer();
    }

    imageOnError = () => {
        this.setState({ error: _("Image missing"), loading: false });
    }

    imageOnLoad = () => {
        this.setState({ loading: false });
    }

    onMouseDown = (e) => {
        if (!this.state.expandThumb) return;

        const { translateX, translateY } = this.state;
        this.dragging = true;
        this.dragged = false;
        this.startMouseX = e.clientX;
        this.startTranslateX = translateX;
        this.startMouseY = e.clientY;
        this.startTranslateY = translateY;
    }

    onMouseUp = () => {
        if (this.dragging) {
            this.startMouseX = this.startMouseY = 0;
            this.setState({ dragging: false });
        }
        this.dragging = false;
    }

    onMouseMove = (e) => {
        if (this.dragging) {
            const dx = e.clientX - this.startMouseX;
            const dy = e.clientY - this.startMouseY;

            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                this.dragged = true;
                this.setState({
                    dragging: true,
                    translateX: dx + this.startTranslateX,
                    translateY: dy + this.startTranslateY
                });
            }
        }
    }

    touchDistance = e => {
        if (e.touches && e.touches.length === 2) {
            const [t1, t2] = e.touches;
            const dx = t1.clientX - t2.clientX;
            const dy = t1.clientY - t2.clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }

        return 0;
    }

    onTouchStart = e => {
        if (e.touches.length === 2) {
            this.lastTouchDist = this.touchDistance(e);
        } else if (e.touches.length === 1) {
            this.lastTouchDist = 0;
            this.onMouseDown({
                clientX: e.touches[0].clientX,
                clientY: e.touches[0].clientY
            });
        }
    }

    onTouchMove = e => {
        if (e.touches.length === 2 && this.lastTouchDist > 0) {
            const [t1, t2] = e.touches;
            const curDist = this.touchDistance(e);
            const delta = 1.5 * (curDist - this.lastTouchDist);
            if (Math.abs(delta) > 0.05) {
                this.lastTouchDist = curDist;
                this.onMouseWheel({
                    clientX: (t1.clientX + t2.clientX) / 2,
                    clientY: (t1.clientY + t2.clientY) / 2,
                    deltaY: -delta
                });
            }
        } else if (e.touches.length === 1) {
            this.onMouseMove({
                clientX: e.touches[0].clientX,
                clientY: e.touches[0].clientY
            });
        }
    }

    onTouchEnd = () => {
        this.lastTouchDist = 0;
        this.onMouseUp();
    }

    onMouseWheel = e => {
        if (!this.image || !this.state.expandThumb) return;

        let { translateX, translateY, scale } = this.state;

        const maxScale = 60;

        const rect = this.image.querySelector("img").getBoundingClientRect();
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        const delta = -e.deltaY || e.wheelDelta || -e.detail;
        const zoomFactor = 1.0 + (2.0 * delta / Math.max(window.innerHeight, window.innerWidth));
        const newScale = Math.max(1, scale * zoomFactor);

        if (newScale > maxScale) return;

        const imgX = (mouseX - rect.left) / scale;
        const imgY = (mouseY - rect.top) / scale;

        translateX -= imgX * (newScale - scale);
        translateY -= imgY * (newScale - scale);
        scale = newScale;

        if (scale == 1) {
            translateX = 0;
            translateY = 0;
        }

        this.setState({ translateX, translateY, scale });
    }


    loadPannellum = () => {
        return Utils.dynamicLoad([
            '/static/app/js/vendor/pannellum/pannellum.css',
            '/static/app/js/vendor/pannellum/pannellum.js'], 'pannellum');
    }

    getVideoUrl() {
        return `${this.props.basePath}/download/${encodeURIComponent(this.props.media.filename)}`;
    }

    closeVideoViewer = () => {
        if (this.videoOverlay) {
            this.videoOverlay.remove();
            this.videoOverlay = null;
        }
        if (this.videoEscHandler) {
            document.removeEventListener('keydown', this.videoEscHandler, true);
            this.videoEscHandler = null;
        }
    }

    openVideoViewer = () => {
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        this.videoOverlay = overlay;

        this.videoEscHandler = (e) => {
            if (e.key === 'Escape') {
                e.stopImmediatePropagation();
                e.preventDefault();
                this.closeVideoViewer();
            }
        };
        document.addEventListener('keydown', this.videoEscHandler, true);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'video-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => this.closeVideoViewer();
        overlay.appendChild(closeBtn);

        const video = document.createElement('video');
        video.className = 'video-player';
        video.src = this.getVideoUrl();
        video.controls = true;
        video.autoplay = true;
        overlay.appendChild(video);

        if (this.props.media.description) {
            const desc = document.createElement('div');
            desc.className = 'media-description';
            desc.textContent = this.props.media.description;
            overlay.appendChild(desc);
        }

        document.body.appendChild(overlay);
    }

    buildPanoConfig() {
        const { media, basePath } = this.props;
        const TILE_SIZE = 2048;
        const imgW = media.width || 4096;
        const cubeSize = 8 * Math.floor(imgW / Math.PI / 8);
        const tileSize = Math.min(TILE_SIZE, cubeSize);
        let levels = Math.ceil(Math.log(cubeSize / tileSize) / Math.log(2)) + 1;
        if (levels >= 2 && Math.floor(cubeSize / Math.pow(2, levels - 2)) === tileSize) {
            levels -= 1;
        }
        const tilePath = `${basePath}/panorama/${encodeURIComponent(media.filename)}/tiles/%l/%s/%y/%x`;
        return {
            autoLoad: true,
            type: "multires",
            multiRes: {
                path: tilePath,
                extension: "jpg",
                tileResolution: tileSize,
                maxLevel: levels,
                cubeResolution: cubeSize,
            },
            showControls: false,
            autoRotate: -1,
            title: Utils.escapeHtml(media.description) || ""
        };
    }

    openPanoViewer = () => {
        this.loadPannellum().then(() => {
            const overlay = document.createElement('div');
            overlay.className = 'pano-overlay';

            const closePano = () => {
                if (this.panoViewer) {
                    this.panoViewer.destroy();
                    this.panoViewer = null;
                }
                document.removeEventListener('keydown', escHandler, true);
                overlay.remove();
            };

            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    closePano();
                }
            };
            document.addEventListener('keydown', escHandler, true);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'pano-close-btn';
            closeBtn.innerHTML = '&times;';
            closeBtn.onclick = closePano;
            overlay.appendChild(closeBtn);

            const container = document.createElement('div');
            container.className = 'pano-container';
            overlay.appendChild(container);

            document.body.appendChild(overlay);

            this.panoViewer = window.pannellum.viewer(container, this.buildPanoConfig());
        });
    }

    photoEscHandler = (e) => {
        if (e.key === 'Escape') {
            e.stopImmediatePropagation();
            e.preventDefault();
            this.onImgClick();
        }
    };

    onImgClick = () => {
        if (this.props.media.type === 'pano') {
            this.openPanoViewer();
            return;
        }
        if (this.props.media.type === 'video') {
            this.openVideoViewer();
            return;
        }

        // Photo
        const { expandThumb } = this.state;
        
        const image = this.image;
        if (!image) return;

        if (!expandThumb) {
            if (image.parentElement && image.parentElement.classList.contains('media-thumb-container')) {
                this.originalParent = image.parentElement;
                document.body.appendChild(image);
                document.addEventListener('keydown', this.photoEscHandler, true);
            }
            this.setState({ loading: true, expandThumb: true, translateX: 0, translateY: 0, scale: 1 });
        } else if (!this.dragged) {
            if (image.parentElement === document.body && this.originalParent) {
                this.originalParent.appendChild(image);
                document.removeEventListener('keydown', this.photoEscHandler, true);
            }
            this.setState({ expandThumb: false, translateX: 0, translateY: 0, scale: 1 });
        }
    }

    render() {
        const { error, visible, loading, expandThumb, dragging, translateX, translateY, scale } = this.state;
        const imageUrl = expandThumb ? this.getImageUrl() : this.getThumbUrl();
        const isVideo = this.props.media.type === 'video';

        return (<div className="media-view" ref={this.ref}>
            {(loading || !visible) ? <div><i className="fa fa-circle-notch fa-spin fa-fw media-loading"></i></div>
                : ""}
            {error !== "" ? <div style={{ marginTop: "8px" }}>{error}</div>
                : visible ? <div className="media-thumb-container">
                    <div ref={(domNode) => { this.image = domNode; }} className={`media-view-image ${expandThumb ? "fullscreen" : ""} ${dragging ? "dragging" : ""}`}>
                        {loading && expandThumb ? <div><i className="fa fa-circle-notch fa-spin fa-fw"></i></div> : ""}
                        <div className="media-thumb" draggable="false" onClick={this.onImgClick}>
                            <img draggable="false" style={{ visibility: loading ? "hidden" : "visible", borderRadius: "4px", transform: `translate(${translateX}px, ${translateY}px) scale(${scale})` }} src={imageUrl} onLoad={this.imageOnLoad} onError={this.imageOnError} alt={this.props.media.filename} title={this.props.media.filename} />
                            {isVideo && !loading ? <div className="video-play-overlay"><i className="fa fa-play"></i></div> : ""}
                        </div>
                        {expandThumb && this.props.media.description ?
                            <div className="media-description">{this.props.media.description}</div>
                            : ""}
                    </div>
                </div> : ""}
        </div>);
    }
}

export default MediaView;
