

// import $ from 'jquery'
import TWEEN from 'tween';
import _ from 'lodash';

// const OrbitControls = require('three-orbit-controls')(THREE);
require('imports-loader?THREE=three!three/examples/js/controls/TrackballControls.js');
const Stats = require('imports-loader?THREE=three!three/examples/js/libs/stats.min.js');

import Common from './../util/Common';

import DepthDisplay from './displayComponents/DepthDisplay';
import CameraControl from './../camera/cameraControl';
import Environments from './../environments';

import VR from './vr/vr.js';

class Scene {
  constructor() {
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;

    this.container;
    this.w;
    this.h;

    this.stats = null;

    this.vr = null;

    this.environments = null;

    this.videos = [];

    this.performers = [];

  }

  registerPerformer(performerId) {
    for (var i = 0; i < this.videos.length; i++) {
      if (this.videos[i].performer === null) {
        this.videos[i].performer = this.environments.performers.performers[performerId];
        this.performers.push(performerId);
        console.log('performer added to video');
        console.log(this.videos);
        break;
      }
    }
  }

  initVideo() {

      var center = {x: window.innerWidth / 2, y: window.innerHeight / 2};

      navigator.mediaDevices.enumerateDevices().then((deviceInfo) => {

        var videoInputs = _.filter(deviceInfo, (device) => {
          return device.kind === 'videoinput';
        });

        _.each(videoInputs, (device) => {
          var canvasSource = document.createElement('canvas');
          var canvasBlended = document.createElement('canvas');
          canvasSource.width = canvasBlended.width = 250;
          canvasSource.height = canvasBlended.height = 182;

          var contextBlended = canvasBlended.getContext('2d');
          var contextSource = canvasSource.getContext('2d');

          document.body.insertBefore(canvasBlended, document.body.firstChild);
          document.body.insertBefore(canvasSource, document.body.firstChild);

          navigator.mediaDevices.getUserMedia(
            { video: { deviceId: { exact: device.deviceId } } }
          ).then((stream) => {
            var video = document.createElement('video');
            video.src = window.URL.createObjectURL(stream);
            this.videos.push({
              video: video,
              canvasSource: canvasSource,
              canvasBlended: canvasBlended,
              contextSource: contextSource,
              contextBlended: contextBlended,
              lastImageData: null,
              performer: null,
            });
          });
        });

      });
  }

  getBrightness(target, curData, prevData, canvasWidth, obj) {

      if (curData.length !== prevData.length) return null;
      var curLeftAvg = 0;
      var curRightAvg = 0;
      var prevLeftAvg = 0;
      var prevRightAvg = 0;

      var i = 0;
      var width = canvasWidth;
      var x = 0; // x position / column
      var total = 0;

      // each pixel represented by 4 elements
      while (i < (curData.length * 0.25)) {
          var curAverage = (curData[4*i] + curData[4*i+1] + curData[4*i+2]) / 3;
          var prevAverage = (prevData[4*i] + prevData[4*i+1] + prevData[4*i+2]) / 3;

          if (x <= width / 2) { // left half of the screen
            curLeftAvg += curAverage;
            prevLeftAvg += prevAverage;
          } else if (x > width / 2 && x < width) { // right half of the screen
            curRightAvg += curAverage;
            prevRightAvg += prevAverage;
          } else { // increment down a row when we've reached the end
              x = 0;
              continue;
          }
          ++i;
          x++;
      }

      var dataLength = curData.length * 0.125;
      curLeftAvg /= dataLength;
      curRightAvg /= dataLength;
      prevLeftAvg /= dataLength;
      prevRightAvg /= dataLength;

      var curTotalAvg = (curLeftAvg + curRightAvg) / 2;
      var prevTotalAvg = (prevLeftAvg + prevRightAvg) / 2;

      var i = 0;
      var x = 0;
      while (i < (curData.length * 0.25)) {
        if (x > width) x = 0;
        target[4*i] = x <= width / 2 ? curLeftAvg : curRightAvg;
        target[4*i+1] = x <= width / 2 ? curLeftAvg : curRightAvg;
        target[4*i+2] = x <= width / 2 ? curLeftAvg : curRightAvg;
        target[4*i+3] = 0xFF;

        ++i;
        x++;

      }

      // Sides are inverted when displayed
      const x2 = (curLeftAvg - curRightAvg - 25) / 500;
      const y2 = (curTotalAvg - 40) / 50;
      //console.log(x2);//curLeftAvg - curRightAvg);
      //console.log(y2);//curTotalAvg);
      // console.log(x2);//curLeftAvg - curRightAvg);
      // console.log(y2);//curTotalAvg);

    if (obj.performer) {
        obj.performer.pushOffset2D(x2, y2);
    }
  }

  blend(obj) {
      var width = obj.canvasSource.width;
      var height = obj.canvasSource.height;
      var sourceData = obj.contextSource.getImageData(0, 0, width, height);
      if (!obj.lastImageData) {
        obj.lastImageData = obj.contextSource.getImageData(0, 0, width, height);
      }
      var blendedData = obj.contextSource.createImageData(width, height);
      this.getBrightness(blendedData.data, sourceData.data, obj.lastImageData.data, obj.canvasSource.width, obj);
      obj.contextBlended.putImageData(blendedData, 0, 0);
      obj.lastImageData = sourceData;
  }

  initScene(startPos, inputs, statsEnabled, performers, backgroundColor) {
    this.container = $('#scenes');

    this.w = this.container.width();
    this.h = this.container.height();

    // / Global : this.renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

    this.renderer.gammaInput = true;
    this.renderer.gammaOutput = true;

    this.effect = new THREE.OutlineEffect( this.renderer );

    this.renderer.setClearColor(backgroundColor);
    this.renderer.setSize(this.w, this.h);

    // this.renderer.shadowMap.enabled = true;
    // // to antialias the shadow
    // this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // / Global : this.scene
    this.scene = new THREE.Scene();
    window.scene = this.scene;

    // var axisHelper = new THREE.AxisHelper( 5 );
    // this.scene.add( axisHelper );

    // this.scene.fog = new THREE.FogExp2( 0x171223, 0.00075 , 10000);
    // this.scene.fog = new THREE.FogExp2( 0x0C0F15, 0.0075 , 100);

    // / Global : this.camera
    this.camera = new THREE.PerspectiveCamera(20, this.w / this.h, 0.001, 1000000);

    window.camera = this.camera;

    // var src = Common.convertLatLonToVec3(startPos.lat, startPos.lon).multiplyScalar(radius);

    // this.camera.position.copy(src);
    this.camera.position.set(0, 1.5000000041026476, 119.999990045581438);

    this.scene.add(this.camera);

    this.environments = new Environments(this.renderer, this.scene, performers);
    window.environments = this.environments;

    // orbit control
    // this.controls = new OrbitControls(this.camera, this.renderer.domElement);

    // this.controls.enableDamping = false;
    // this.controls.enableZoom = (inputs.indexOf('mouse') >= 0);
    // this.controls.enableRotate = (inputs.indexOf('mouse') >= 0);
    // this.controls.enablePan = (inputs.indexOf('mouse') >= 0);

    // this.controls.autoRotate = false;
    // this.controls.autoRotateSpeed = 3;

    // this.controls.enableKeys = false;

    this.controls = new THREE.TrackballControls( this.camera );
    this.controls.target = new THREE.Vector3(0,1.5,0);
    window.controls = this.controls;

    var createSpotlight = function( color ) {
        var newObj = new THREE.SpotLight( color, 2 );
        newObj.castShadow = true;
        newObj.angle = 0.3;
        newObj.penumbra = 0.2;
        newObj.decay = 2;
        newObj.distance = 50;
        newObj.shadow.mapSize.width = 1024;
        newObj.shadow.mapSize.height = 1024;
        return newObj;
      }

    this.spotLight1 = createSpotlight( 0x00FFFF );
    this.spotLight2 = createSpotlight( 0xFF00FF );
    this.spotLight3 = createSpotlight( 0xFFFF00 );
    this.spotLight1.position.set( 0, 0, 45 );
    this.spotLight2.position.set( 40, 45, 0 );
    this.spotLight3.position.set( -45, 30, 0 );
    this.scene.add(this.spotLight1);
     this.scene.add(this.spotLight2);
      this.scene.add(this.spotLight3);
	this.controls.rotateSpeed = 1.0;
	this.controls.zoomSpeed = 1.2;
	this.controls.panSpeed = 0.8;
	this.controls.noZoom = false;
	this.controls.noPan = false;
	this.controls.staticMoving = true;
	this.controls.dynamicDampingFactor = 0.3;
	this.controls.keys = [ 65, 83, 16 ];
	// this.controls.addEventListener( 'change', t )

    this.stats = new Stats();
    if (statsEnabled) {
      this.stats.dom.id = 'stats';
      $('#statsBox').append(this.stats.dom);
    }

    // attach this.renderer to DOM
    this.container.append(this.renderer.domElement);

    this.clock = new THREE.Clock();

    this.cameraControl = new CameraControl(this.scene, this.camera, this.controls);

    this.vr = new VR(this.renderer, this.camera, this.scene, this.controls);

    // initiating renderer
    this.render();

    window.addEventListener('resize', this.onWindowResize.bind(this), false);

    this.initVideo();

  }

  toggleRotation() {
    this.controls.autoRotate = !this.controls.autoRotate;
  }

  setRotation() {
    this.controls.autoRotate = true;
  }

  unsetRotation() {
    this.controls.autoRotate = false;
  }

  setRotationSpeed(val) {
    this.controls.autoRotateSpeed = val;
  }

  switchEnvironment(env) {
    if (this.environments) {
      console.log(`Switching Environment to: ${env}`);
      this.environments.add(env);
    }
  }

  viewKinectTransportDepth(depthObj) {
    const imgWidth = 512; const imgHeight = 424; // width and hight of kinect depth camera

    if (!this.kinectPC) { // create point cloud depth display if one doesn't exist
      const dimensions = {
        width: imgWidth, height: imgHeight, near: 58, far: 120,
      };
      this.kinectPC = new DepthDisplay(this.scene, dimensions, 30, false);
    }

    // this.kinectPC.moveSlice();
    this.kinectPC.updateDepth('kinecttransport', depthObj.depth.buffer.data);
    this.kinectPC.updateColor('kinecttransport', depthObj.depth.buffer.data);
  }

  viewKinectTransportBodies(bodiesObj) {
    // console.log(bodiesObj.bodies.trackingIds.length);
    const bodies = bodiesObj.bodies.bodies;
    if (!this.bodies) {
      this.bodies = {};
    }

    _.each(bodies, (body, idx) => {
      // body.id;
      if (!this.bodies[idx]) {
        this.bodies[idx] = new Performer(this.scene, idx);
      }

      this.bodies[idx].updateJoints(body.joints);
    });
  }

  render() {
    this.controls.update();
    TWEEN.update();


    if (this.effect)
    {
     this.effect.render(this.scene, this.camera);
    }
    if (this.performer) {
      this.performer.update(this.clock.getDelta());
    }

    if (this.environments) {
      this.environments.update(this.clock.getDelta());
    }

    this.cameraControl.update();

    if (this.vr) {
      this.vr.update();
    }

    this.renderer.render(this.scene, this.camera);

    this.stats.update();

    if (window.environments.performers && window.environments.performers.performers) {
      _.each(Object.keys(window.environments.performers.performers), (performerId) => {
        if (this.performers.indexOf(performerId) === -1) {
          this.registerPerformer(performerId);
        }
      });
    }

    _.each(this.videos, (obj) => {
      obj.contextSource.drawImage(obj.video, 0, 0, obj.canvasSource.width, obj.canvasSource.height);
      this.blend(obj);
    })

    requestAnimationFrame(this.render.bind(this));
  }

  onWindowResize() {
    this.controls.update();

    this.w = this.container.width();
    this.h = this.container.height();

    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(this.w, this.h);
  }
}

export default Scene;
