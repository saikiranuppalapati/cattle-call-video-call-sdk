'use strict';
const trim = require("trim");
const fs = require("fs");
const path = require("path");
const socketClient = require("socket.io-client");
const adapter = require('webrtc-adapter');
const SOKET_SERVER_URL = "https://cattlecall.azurewebsites.net";
var rtcPeerConn;
var videoLoginUserId = 0;
var videoCallUserId = 0;
let callId = 0;
let maxDuration = 0;
var localVideoStream = null;
var remoteVideoStream = null;
var ROOM = "";
var socket = null;
let localVideoSelector;
let remoteVideoSelector;
let isIncomingCall = false;
let callData = {};
let isCaller = false;
let audioStatus = true;
let videoStatus = true;
let __this;
let audioSource = "";
let videoSource = "";
let configurationVideocall = {};
let doNegotication = true;
let makingOffer = false, ignoreOffer = false;
class CattleCall {
    constructor(user_id, clientId, clientSecret) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.socket = null;
        this.userId = user_id;
        this.ready = false;
        this.incommingcall;
        socket = socketClient.connect(SOKET_SERVER_URL, { query: "client_id=" + this.clientId + "&clientSecret=" + this.clientSecret + "&user_id=" + user_id + "&platform=1" });
        socket.on('connect', () => {
            this.listenSockets();
        });
        __this = this;
        videoLoginUserId = user_id;
    }
    addUser(data) {
        return new Promise(async (resolve, reject) => {
            if (data.name == "" || data.name === undefined || data.name.length < 3) {
                reject("inavlid user name")
            }
            socket.emit("add_user", data, function (response) {
                if (response.success) {
                    resolve(response);
                }
                reject(response);
            })
        });
    }
    login() {
        return new Promise((resolve, reject) => {
            let data = { user_id: videoLoginUserId };
            socket.emit("login", data, function (response) {
                if (response.success) {
                    resolve(response);
                }
                reject(response);
            })
        });
    }
    logout() {
        return new Promise((resolve, reject) => {
            let data = { user_id: videoLoginUserId };
            socket.emit("logout", data, function (response) {
                if (response.success) {
                    resolve(response);
                }
                reject(response);
            })
        });
    }
    call(callerId, localVideoElement, remoteVideoElement, audioDevice, videoDevice) {
        if (audioDevice) {
            audioSource = audioDevice;
        }
        if (videoDevice) {
            videoSource = videoDevice;
        }
        var room = "";
        if (videoLoginUserId < callerId) {
            room = videoLoginUserId + "_" + callerId;
        } else {
            room = callerId + "_" + videoLoginUserId;
        }
        ROOM = room;
        localVideoSelector = document.querySelector(localVideoElement);
        remoteVideoSelector = document.querySelector(remoteVideoElement);
        callData = { user_id: videoLoginUserId, share_user_id: callerId, room: ROOM };
        localStorage.setItem("m5wHOFdo1NJWEen4", btoa(JSON.stringify(callData)));
        socket.emit("video_call_user", callData);
        isCaller = true;
        videoCallUserId = callerId;
    }
    answerCall(data) {
        localVideoSelector = document.querySelector(data.localVideoElement);
        remoteVideoSelector = document.querySelector(data.remoteVideoElement);
        let calldata = localStorage.getItem("m5wHOFdo1NJWEen4");
        if (calldata != "null" && calldata !== null) {
            callData = JSON.parse(atob(calldata));
            videoCallUserId = callData.share_user_id;
            ROOM = callData.room;
        }
        if (data.audioDevice) {
            audioSource = data.audioDevice;
        }
        if (data.videoDevice) {
            videoSource = data.videoDevice;
        }
        socket.emit("join_video_call", callData);
    }
    toggleVideo() {
        videoStatus = videoStatus ? false : true;
        if (!localVideoStream) return;
        for (let track of localVideoStream.getVideoTracks()) {
            track.enabled = !track.enabled;
        }
        let data = { "status": videoStatus, 'share_user_id': videoCallUserId };
        socket.emit("video_toogle", data);
    }
    toggleAudio() {
        audioStatus = audioStatus ? false : true;
        if (!localVideoStream) return;
        for (let track of localVideoStream.getAudioTracks()) {
            track.enabled = !track.enabled;
        }
        let data = { "status": audioStatus, 'share_user_id': videoCallUserId };
        socket.emit("audio_toogle", data);
    }
    endCall() {
        stopVideoCalling(true);
    }
    reject() {
        socket.emit("reject_video_call", { user_id: videoLoginUserId, share_user_id: videoCallUserId, call_id: callId });
    }

    /** getDevices is used to get audio / video devices **/

    async getDevices() {
        return new Promise(async (resolve, reject) => {
            await navigator.mediaDevices.getUserMedia({ audio: true })
                .then(function () {
                    console.log("audio working");
                }).catch(function (err) {
                    if (err.name === "NotFoundError") {
                        audioStatus = false;
                    }
                });
            await navigator.mediaDevices.getUserMedia({ video: true })
                .then(function () {
                    console.log("video working");
                }).catch(function (err) {
                    if (err.name === "NotFoundError") {
                        videoStatus = false;
                    }
                    console.log(err)
                    videoStatus = false;
                });
            var videoInputs = [];
            var audioInputs = [];
            navigator.mediaDevices.enumerateDevices().then(function (deviceInfos) {
                for (var i = 0; i !== deviceInfos.length; ++i) {
                    var deviceInfo = deviceInfos[i];
                    if (deviceInfo.kind === "videoinput") {
                        videoInputs.push(deviceInfo);
                    } else if (deviceInfo.kind == "audioinput") {
                        audioInputs.push(deviceInfo);
                    }
                }
                resolve({ audio: audioInputs, video: videoInputs });
            }).catch(function (err) {
                reject(err);
            });
        })
    }
    listenSockets() {
        //getServers();
        socket.on("configuration", function (data) {
            configurationVideocall = data;
            __this.onReady();
        });
        socket.on("video_signal", function (data) {
            if (localVideoSelector == null) return false;
            switch (data.type) {
                case "offer":
                    onOffer(data.offer);
                    break;
                case "answer":
                    onAnswer(data.answer);
                    break;
                case "candidate":
                    onCandidate(data.candidate);
                    break;
                default:
                    break;
            }
        });
        socket.on("video_call_user", function (data) {
            ROOM = data.room;
            videoCallUserId = data.user_id;
            callId = data.call_id;
            maxDuration = data.max_duration;
            callData = { user_id: data.share_user_id, share_user_id: data.user_id, room: ROOM, call_id: data.call_id, max_duration: data.max_duration }
            localStorage.setItem("m5wHOFdo1NJWEen4", btoa(JSON.stringify(callData)));
            if (typeof __this.incommingCall == "function") {
                __this.incommingCall(data.caller);
            }
            isIncomingCall = true;
        });
        socket.on("join_video_call", function (data) {
            if (remoteVideoSelector) {
                callData.call_id = data.call_id;
                callId = data.call_id;
                maxDuration = data.max_duration;
                setCallEndTimer(maxDuration);
                initWebRtc(callData.user_id, callData.share_user_id, true, isCaller);
                if (typeof __this.callAnswered == "function") {
                    __this.callAnswered(callData.user_id);
                }
            }
        });
        socket.on("video_toogle", function (data) {
            if (typeof __this.onVideoChange == "function") {
                __this.onVideoChange(data);
            }
        });
        socket.on("audio_toogle", function (data) {
            if (typeof __this.onAudioChange == "function") {
                __this.onAudioChange(data);
            }
        }); // 
        socket.on("stop_video_call", function (data) {
            if (typeof __this.onCallEnd == "function") {
                __this.onCallEnd(data);
            }
            stopVideoCalling(false);
        });
        socket.on("reject_video_call", function (data) {
            if (typeof __this.onReject == "function") {
                __this.onReject({ status: false });
            }
        })
        socket.on('cattle_call_error', (error) => {
            console.log(error);
        });
        socket.on('error', (error) => {
            __this.onerror(error);
        });
        socket.on('call_answered', (data) => {
            if (typeof __this.onCallAnswered == "function") {
                __this.onCallAnswered(data);
            }
        })
    }
    switchMeadiDevices(audioDevice, videoDevice) {
        if (audioDevice) {
            audioSource = audioDevice;
        }
        if (videoDevice) {
            videoSource = videoDevice;
        }
        addStream();
    }

}

function initWebRtc(userId, shareUserId, isStream, isCaller) {
    if (remoteVideoSelector == null) return false;
    rtcPeerConn = new RTCPeerConnection(configurationVideocall);
    rtcPeerConn.onicecandidate = function (evt) {
        if (evt.candidate) {
            socket.emit('video_signal', { "type": "candidate", "candidate": evt.candidate, "user_id": videoLoginUserId, "share_user_id": videoCallUserId, room: ROOM });
        }
    };
    rtcPeerConn.onnegotiationneeded = async function () {
        makingOffer = true;
        const offerOptions = { offerToReceiveAudio: 1, offerToReceiveVideo: 1 };
        rtcPeerConn.createOffer(offerOptions).then((desc) => {
            if (rtcPeerConn.signalingState != "stable") return;
            rtcPeerConn.setLocalDescription(desc).then(() => {
                socket.emit('video_signal', { "type": "offer", 'offer': rtcPeerConn.localDescription, user_id: videoLoginUserId, 'share_user_id': videoCallUserId, room: ROOM });
                makingOffer = true;
            }).catch(error => {
                console.log("setLocalDescription error", error);
                makingOffer = true;
            });
        }).catch(e => {
            console.log("offer error", error);
            makingOffer = true;
        });
    };
    rtcPeerConn.onopen = function () {
        console.log("Connected");
    };
    rtcPeerConn.onerror = function (err) {
        console.log("Got error", err);
    };
    rtcPeerConn.oniceconnectionstatechange = function () {
        try {
            if (rtcPeerConn.iceConnectionState == 'disconnected') {
                console.log("disconnected");
            } else if (rtcPeerConn.iceConnectionState == 'failed') {
                reconnectVideoCall();
                console.log("failed");
            } else if (rtcPeerConn.iceConnectionState == 'closed') {
                stopVideoCalling(true);
                console.log("closed");
            } else if (rtcPeerConn.iceConnectionState == 'connected') {
                console.log("connected");
            }
        } catch (e) {

        }
    };
    rtcPeerConn.ontrack = function (evt) {
        remoteVideoStream = evt.streams[0];
        if (remoteVideoSelector) {
            remoteVideoSelector.srcObject = remoteVideoStream;
        } else {
            console.log("remote video element not found")
        }
    };
    if (isStream) {
        addStream();
    }
    return;
}
/** onOffer method is used to set remote offer and set local answer and send answer to another peer connection **/

async function onOffer(offer) {
    if (!rtcPeerConn) {
        await initWebRtc(videoLoginUserId, videoCallUserId, true, false);
        console.log("creating peerconnection");
        //doNegotication = false;
    }
    if (rtcPeerConn.signalingState != "stable") {
        await rtcPeerConn.setLocalDescription({ type: "rollback", sdp: "" });
        console.log(rtcPeerConn.signalingState, "offer collision");
    }
    rtcPeerConn.setRemoteDescription(new RTCSessionDescription(offer)).then(async () => {
        rtcPeerConn.createAnswer().then(function (answer) {
            rtcPeerConn.setLocalDescription(answer).catch(error => {
                console.log(error);
            });
            socket.emit('video_signal', { "type": "answer", answer: answer, "user_id": videoLoginUserId, "share_user_id": videoCallUserId, room: ROOM });
        }).catch(error => {
            console.log(error, "error while creating answer");
        })
    }).catch(err => {
        console.log(err, "error seting remote description");
    })
}

/** onAnswer method is used to set remote answer **/

function onAnswer(answer) {
    if (!rtcPeerConn) {
        initWebRtc(videoLoginUserId, videoCallUserId, true, false);
        doNegotication = true;
    }
    rtcPeerConn.setRemoteDescription(new RTCSessionDescription(answer)).catch(error => {
        console.log(error);
    });
}
/** onCandidate method is used to set candidates to peer connection **/

function onCandidate(candidate) {
    if (!rtcPeerConn) {
        initWebRtc(videoLoginUserId, videoCallUserId, true, true);
        console.log("connection not there");
        return;
    }
    if (candidate) {
        rtcPeerConn.addIceCandidate(new RTCIceCandidate(candidate)).catch(error => {
            console.log(error, "addIceCandidate")
        });
    } else {
        console.log(candidate, "invalid candidate");
    }
}

/** stop video call method is used to end peer connection **/
function stopVideoCalling(trigger) {
    if (trigger) {
        socket.emit("stop_video_call", { user_id: videoLoginUserId, share_user_id: videoCallUserId, call_id: callId });
    }
    if (rtcPeerConn) {
        try {
            rtcPeerConn.close();
            rtcPeerConn.onicecandidate = null;
            rtcPeerConn.ontrack = null;
        } catch (e) {
            console.log("close connection", e);
        }
    }
    rtcPeerConn = null;
    if (localVideoStream != null) {
        try {
            localVideoStream.stop();
        } catch (e) {
            console.log("stream Err", e);
        }
        localVideoStream = null;
    }
    localStorage.setItem('m5wHOFdo1NJWEen4', null)
}


/** addStream is used to set local stream to peer connection **/

function addStream() {
    if (remoteVideoSelector == null) return false;
    // get a local stream, show it in our video tag and add it to be sent
    if (localVideoStream != null) {
        localVideoStream.stop();
    }
    let constraints = {
        audio: audioStatus,
        video: videoStatus
    };
    if (videoSource !== "") {
        constraints.video = { deviceId: videoSource }
    }
    if (audioSource !== "") {
        constraints.audio = { deviceId: audioSource }
    }
    navigator.mediaDevices.getUserMedia(constraints).then(stream => {
        localVideoStream = stream;
        localVideoStream.stop = function () {
            this.getAudioTracks().forEach(function (track) {
                track.stop();
            });
            this.getVideoTracks().forEach(function (track) { //in case... :)
                track.stop();
            });
        };
        stream.getTracks().forEach(track => rtcPeerConn.addTrack(track, stream));
        if (localVideoSelector) {
            localVideoSelector.srcObject = localVideoStream;
        }
        return true;
    }).catch(err => {
        console.log(err);
        alert(err.message);
        return false;
    });
}

/** reconnectVideoCall is used to reconnect call when call dropped due to network fluctuations **/

function reconnectVideoCall() {
    if (videoCallUserId != 0 && socket !== null) {
        if (rtcPeerConn.iceConnectionState == "disconnected" || rtcPeerConn.iceConnectionState == "failed") {
            if (1) {
                const offerOptions = { offerToReceiveAudio: 1, offerToReceiveVideo: 1, iceRestart: true };
                rtcPeerConn.createOffer(offerOptions).then((desc) => {
                    rtcPeerConn.setLocalDescription(desc).then(() => {
                        socket.emit('video_signal', { "type": "offer", 'offer': rtcPeerConn.localDescription, user_id: videoLoginUserId, 'share_user_id': videoCallUserId, room: ROOM });
                    }).catch(error => {
                        console.log("setLocalDescription error", error)
                    });
                }).catch(err => {
                    console.log("offer error", err)
                });
            }
        }
    }
}

/** sendLocalDesc method is used to send local offer to remote peer connection **/
function getServers() {
    let data = {};
    socket.emit('configuration', data, function (data) {
        configurationVideocall = data;
        __this.onReady();
    })
}
window.onbeforeunload = function (evt) {
    if (rtcPeerConn) {
        try {
            rtcPeerConn.close();
            rtcPeerConn.onicecandidate = null;
            rtcPeerConn.ontrack = null;
        } catch (e) {
            console.log("close connection", e);
        }
    }
    rtcPeerConn = null;
    if (localVideoStream != null) {
        try {
            localVideoStream.stop();
        } catch (e) {
            console.log("stream Err", e);
        }
        localVideoStream = null;
    }
}
function setCallEndTimer(time) {
    let timeint = parseInt(time) * 60000;
    setTimeout(() => {
        stopVideoCalling(true)
    }, timeint);
}
module.exports = CattleCall;
global.CattleCall = CattleCall;
window.CattleCall = CattleCall;