import React from 'react';
import PropTypes from 'prop-types';
import '../css/MediaView.scss';
import { _ } from '../classes/gettext';
import $ from 'jquery';

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
        return `${this.getImageUrl()}?thumbnail=256`;
    }

    componentDidMount() {
        this.observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setTimeout(() => {
                        if (this.image && !this.registeredEvents) {
                            this.image.addEventListener("fullscreenchange", this.onFullscreenChange);
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
            this.image.removeEventListener("fullscreenchange", this.onFullscreenChange);
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
    }

    onFullscreenChange = (e) => {
        if (!document.fullscreenElement) {
            this.setState({ expandThumb: false });
        }
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
        if (window.pannellum) return Promise.resolve();
        if (this._pannellumLoading) return this._pannellumLoading;

        this._pannellumLoading = new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/static/app/js/vendor/pannellum/pannellum.css';
            document.head.appendChild(link);

            const script = document.createElement('script');
            script.src = '/static/app/js/vendor/pannellum/pannellum.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
        return this._pannellumLoading;
    }

    openPanoViewer = () => {
        this.loadPannellum().then(() => {
            const overlay = document.createElement('div');
            overlay.className = 'pano-overlay';

            const closeBtn = document.createElement('button');
            closeBtn.className = 'pano-close-btn';
            closeBtn.innerHTML = '&times;';
            closeBtn.onclick = () => {
                if (this.panoViewer) {
                    this.panoViewer.destroy();
                    this.panoViewer = null;
                }
                overlay.remove();
            };
            overlay.appendChild(closeBtn);

            const container = document.createElement('div');
            container.className = 'pano-container';
            overlay.appendChild(container);

            document.body.appendChild(overlay);

            const configUrl = `${this.props.basePath}/panorama/${encodeURIComponent(this.props.media.filename)}/config.json`;

            $.getJSON(configUrl)
                .done(config => {
                    this.panoViewer = window.pannellum.viewer(container, config);
                });
        });
    }

    onImgClick = () => {
        if (this.props.media.type === 'pano') {
            this.openPanoViewer();
            return;
        }

        const { expandThumb } = this.state;

        if (!expandThumb) {
            this.image.requestFullscreen();
            this.setState({ loading: true, expandThumb: true, translateX: 0, translateY: 0, scale: 1 });
        } else if (!this.dragged) {
            document.exitFullscreen();
            this.setState({ expandThumb: false, translateX: 0, translateY: 0, scale: 1 });
        }
    }

    render() {
        const { error, visible, loading, expandThumb, dragging, translateX, translateY, scale } = this.state;

        const imageUrl = expandThumb ? this.getImageUrl() : this.getThumbUrl();

        return (<div className="media-view" ref={this.ref}>
            {(loading || !visible) ? <div><i className="fa fa-circle-notch fa-spin fa-fw media-loading"></i></div>
                : ""}
            {error !== "" ? <div style={{ marginTop: "8px" }}>{error}</div>
                : visible ? <div>
                    <div className={`image ${expandThumb ? "fullscreen" : ""} ${dragging ? "dragging" : ""}`}
                        style={{ marginTop: "8px" }}
                        ref={(domNode) => { this.image = domNode; }}>
                        {loading && expandThumb ? <div><i className="fa fa-circle-notch fa-spin fa-fw"></i></div> : ""}
                        <div className="media-thumb" draggable="false" onClick={this.onImgClick}><img draggable="false" style={{ borderRadius: "4px", transform: `translate(${translateX}px, ${translateY}px) scale(${scale})` }} src={imageUrl} onLoad={this.imageOnLoad} onError={this.imageOnError} alt={this.props.media.filename} title={this.props.media.filename} /></div>
                        {expandThumb ?
                            <div className="media-description">test desription</div>
                            : ""}
                    </div>
                </div> : ""}
        </div>);
    }
}

export default MediaView;
