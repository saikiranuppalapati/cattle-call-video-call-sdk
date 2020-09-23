'use strict';
const trim = require("trim");
const fs = require("fs");
const path = require("path");
const socketClient=require("socket.io-client");
const adapter=require('webrtc-adapter');
const { rootCertificates } = require("tls");
const SOKET_SERVER_URL="https://cattlecall.azurewebsites.net";
var rtcPeerConn;
var videoLoginUserId = 0;
var videoCallUserId = 0;
let callId=0;
let maxDuration=0;
var localVideoStream = null;
var remoteVideoStream = null;
var ROOM = "";
var socket = null;
let localVideoSelector;
let remoteVideoSelector;
let isIncomingCall=false;
let callData={};
let isCaller=false;
let audioStatus=true;
let videoStatus=true;
let __this;
let audioSource = "default";
let videoSource = "default";
let configurationVideocall = {};
let doNegotication=true;
class CattleCall {
    constructor(user_id,clientId, clientSecret) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.socket=null;
        this.userId=user_id;
        this.ready=false;
        this.incommingcall;
        socket=socketClient.connect(SOKET_SERVER_URL, {query: "client_id="+this.clientId+"&clientSecret="+this.clientSecret+"&user_id="+user_id+"&platform=1"});
        socket.on('connect',()=>{
            this.listenSockets();
        });
        __this=this;
        videoLoginUserId=user_id;
    }
    addUser(data){
        return new Promise(async(resolve,reject)=>{
            if(data.name=="" || data.name===undefined || data.name.length<3){
                reject("inavlid user name")
            }
            socket.emit("add_user",data,function(response){
                if(response.success){
                    resolve(response);
                }
                reject(response);
            })
        });
    }
    login(){
        return new Promise((resolve,reject)=>{
            let data={user_id:videoLoginUserId};
            socket.emit("login",data,function(response){
                if(response.success){
                    resolve(response);
                }
                reject(response);
            })
        });
    }
    logout(){
        return new Promise((resolve,reject)=>{
            let data={user_id:videoLoginUserId};
            socket.emit("logout",data,function(response){
                if(response.success){
                    resolve(response);
                }
                reject(response);
            })
        });
    }
    call(callerId,localVideoElement,remoteVideoElement,audioDevice,videoDevice){
        if(audioDevice){
            audioSource=audioDevice;
        }
        if(videoDevice){
            videoSource=videoDevice;
        }
        var room = "";
        //videoLoginUserId=userId;
        if(videoLoginUserId < callerId){
            room = videoLoginUserId+"_"+callerId;
        }else{
            room = callerId+"_"+videoLoginUserId;
        }
        ROOM = room;
        localVideoSelector=document.querySelector(localVideoElement);
        remoteVideoSelector=document.querySelector(remoteVideoElement);
        callData={user_id : videoLoginUserId,share_user_id : callerId,room : ROOM};
        localStorage.setItem("m5wHOFdo1NJWEen4",btoa(JSON.stringify(callData)));
        socket.emit("video_call_user",callData);
        isCaller=true;
        videoCallUserId=callerId;
    }
    answerCall(data){
        localVideoSelector=document.querySelector(data.localVideoElement);
        remoteVideoSelector=document.querySelector(data.remoteVideoElement);
        let calldata= localStorage.getItem("m5wHOFdo1NJWEen4");
        if(calldata!="null" && calldata!==null){
            callData=JSON.parse(atob(calldata));
            videoCallUserId=callData.share_user_id;
            ROOM=callData.room;
        }
        if(data.audioDevice){
            audioSource=data.audioDevice;
        }
        if(data.videoDevice){
            videoSource=data.videoDevice;
        }
        socket.emit("join_video_call",callData);
    }
    toggleVideo(){
        videoStatus=videoStatus?false:true;
        if (!localVideoStream) return;
        for (let track of localVideoStream.getVideoTracks() ){
            track.enabled = !track.enabled;
        }
        let data={"status":videoStatus,'share_user_id' : videoCallUserId};
        socket.emit("video_toogle",data);
    }
    toggleAudio(){
        audioStatus=audioStatus?false:true;
        if (!localVideoStream) return;
        for (let track of localVideoStream.getAudioTracks() ){
            track.enabled = !track.enabled ;
        }
        let data={"status":audioStatus,'share_user_id' : videoCallUserId};
        socket.emit("audio_toogle",data);
    }
    endCall(){
        stopVideoCalling(true);
    }
    reject(){
        socket.emit("reject_video_call",{ user_id : videoLoginUserId,share_user_id : videoCallUserId,call_id:callId});
    }

   /** getDevices is used to get audio / video devices **/

    getDevices(callback) {
        var videoInputs = [];
        var audioInputs = [];
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            //console.log("enumerateDevices() not supported.");
            return callback("unable to get devices");
          }
            navigator.mediaDevices.enumerateDevices().then(function(deviceInfos){
                for (var i = 0; i !== deviceInfos.length; ++i) {
                    var deviceInfo = deviceInfos[i];
                    if (deviceInfo.kind === "videoinput") {
                        videoInputs.push(deviceInfo);
                    }else if(deviceInfo.kind == "audioinput"){
                        audioInputs.push(deviceInfo);
                    }
                }
                return callback(null,{audio : audioInputs,video : videoInputs});
            }).catch(function(err){
                return callback(err);
            });
        }
    listenSockets(){
        //getServers();
        socket.on("configuration",function(data){
            configurationVideocall=data;
            __this.onReady();
        });
        socket.on("video_signal",function(data){
            if(localVideoSelector==null) return false;
            switch(data.type) {
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
        socket.on("video_call_user",function(data){
            ROOM=data.room;
            videoCallUserId=data.user_id;
            callId=data.call_id;
            maxDuration=data.max_duration;
            callData={user_id : data.share_user_id,share_user_id : data.user_id,room:ROOM,call_id:data.call_id,max_duration:data.max_duration}
            localStorage.setItem("m5wHOFdo1NJWEen4",btoa(JSON.stringify(callData)));
            if(typeof __this.incommingCall =="function"){
                __this.incommingCall(data.caller);
            }
            isIncomingCall=true;
        });
        socket.on("join_video_call",function(data){
            if(remoteVideoSelector){
                callData.call_id=data.call_id;
                callId=data.call_id;
                maxDuration=data.max_duration;
                setCallEndTimer(maxDuration);
                initWebRtc(callData.user_id,callData.share_user_id,true,isCaller);
                if(typeof __this.callAnswered=="function"){
                    __this.callAnswered(callData.user_id);
                }
            }
        });
        socket.on("video_toogle",function(data){
            if(typeof __this.onVideoChange =="function"){
                __this.onVideoChange(data);
            }
        });
        socket.on("audio_toogle",function(data){
            if(typeof __this.onAudioChange=="function"){
                __this.onAudioChange(data);
            }
        }); // 
        socket.on("stop_video_call",function(data){
            if(typeof __this.onCallEnd=="function"){
            __this.onCallEnd(data);
            }
            stopVideoCalling(false);
        });
        socket.on("reject_video_call",function(data){
            if(typeof __this.onReject=="function"){
                __this.onReject({status:false});
            }
        })
        socket.on('cattle_call_error', (error) => {
            console.log(error);
        });
        socket.on('error', (error) => {
           __this.onerror(error);
        });
    }
    switchMeadiDevices(audioDevice,videoDevice){
        if(audioDevice){
            audioSource=audioDevice;
        }
        if(videoDevice){
            videoSource=videoDevice;
        }
        addStream();
    }
    
}

function initWebRtc(userId,shareUserId,isStream,isCaller){
    if(remoteVideoSelector==null)return false;
    rtcPeerConn = new RTCPeerConnection(configurationVideocall);
    rtcPeerConn.onicecandidate = function (evt) {
        if (evt.candidate){
            socket.emit('video_signal',{"type":"candidate", "candidate": evt.candidate,"user_id" : videoLoginUserId,"share_user_id" : videoCallUserId,room:ROOM});
        }
    };
    //if(typeof doNegotication === "undefined") doNegotication = true;
    console.log(rtcPeerConn.signalingState,"signal---");
     rtcPeerConn.onnegotiationneeded = async function () {
        if(rtcPeerConn.signalingState !== "stable"){
            console.log(rtcPeerConn.signalingState,"signal--2");
            return;
        }
         rtcPeerConn.createOffer().then((desc)=>{
                console.log(rtcPeerConn.signalingState,"rtcPeerConn.signalingState")
                if(rtcPeerConn.signalingState != "stable"){
                    console.log(rtcPeerConn.signalingState,"signal---3");
                    rtcPeerConn._negotiating = false;
                    return;
                }
                rtcPeerConn.setLocalDescription(desc).then(()=> {
                    socket.emit('video_signal',{"type":"offer", 'offer': rtcPeerConn.localDescription, user_id : videoLoginUserId,'share_user_id' : videoCallUserId,room:ROOM});
                    rtcPeerConn._negotiating = false;
                }).catch(error=>{
                    console.log("setLocalDescription error",error);
                    rtcPeerConn._negotiating = false;
                });
            }).catch(e=>{
                console.log("offer error",error);
                rtcPeerConn._negotiating = false;
            });
    };
    
    rtcPeerConn.onopen = function () {
        console.log("Connected");
    };

    rtcPeerConn.onerror = function (err) {
        console.log("Got error", err);
    };

    rtcPeerConn.oniceconnectionstatechange = function() {
        try{
            if(rtcPeerConn.iceConnectionState == 'disconnected') {
                
            }else if(rtcPeerConn.iceConnectionState == 'failed'){
                reconnectVideoCall();
                setReconnectingTimer(true);
            }else if(rtcPeerConn.iceConnectionState == 'closed'){
                stopVideoCalling(true);
            }else if(rtcPeerConn.iceConnectionState == 'connected'){
                setReconnectingTimer(false);
            }
        }catch (e){

        }
    };
    rtcPeerConn.ontrack = function (evt) {
        remoteVideoStream = evt.streams[0];
        if(remoteVideoSelector){
            remoteVideoSelector.srcObject =remoteVideoStream;
        }else{
            console.log("remote video element not found")
        }
    };

    if(isStream){
        addStream();
    }
}
/** onOffer method is used to set remote offer and set local answer and send answer to another peer connection **/

async function onOffer(offer) {
    if(!rtcPeerConn){
        await initWebRtc(videoLoginUserId,videoCallUserId,true,false);
        doNegotication=false;
    }
    console.log(rtcPeerConn.signalingState,"rtcPeerConn.signalingState offere");
    if(rtcPeerConn.signalingState!=="stable"){
        await rtcPeerConn.setLocalDescription({type: "rollback",spd:""})
    }
    rtcPeerConn.setRemoteDescription(new RTCSessionDescription(offer)).then(() => {
        rtcPeerConn.createAnswer().then(function(answer){
            rtcPeerConn.setLocalDescription(answer);
            socket.emit('video_signal',{"type":"answer", answer: answer, "user_id" : videoLoginUserId,"share_user_id" : videoCallUserId,room:ROOM});
        }).catch(error=>{
            console.log(error,"error while creating answer");
        })
    }).catch(err=>{
        console.log(err,"error seting remote description");
    })
}

/** onAnswer method is used to set remote answer **/

function onAnswer(answer) {
   if(!rtcPeerConn){
    initWebRtc(videoLoginUserId,videoCallUserId,true,false);
    doNegotication=true;
    }
    rtcPeerConn.setRemoteDescription(new RTCSessionDescription(answer));

}
/** onCandidate method is used to set candidates to peer connection **/

function onCandidate(candidate) {
    if(!rtcPeerConn){
        initWebRtc(videoLoginUserId,videoCallUserId,true,true);
    }
    rtcPeerConn.addIceCandidate(new RTCIceCandidate(candidate),function(){
    },function(err){
        console.log("error",err);
    });
}

/** stop video call method is used to end peer connection **/


function stopVideoCalling(trigger){
    if(trigger){
        socket.emit("stop_video_call",{ user_id : videoLoginUserId,share_user_id : videoCallUserId,call_id:callId});
    }
    if(rtcPeerConn){
        try{
            rtcPeerConn.close();
            rtcPeerConn.onicecandidate = null;
            rtcPeerConn.ontrack = null;
        }catch (e){
            console.log("close connection",e);
        }
    }
    rtcPeerConn = null;
    if(localVideoStream != null){
        try{
            localVideoStream.stop();
        }catch (e){
            console.log("stream Err",e);
        }
        localVideoStream = null;
    }
    localStorage.setItem('m5wHOFdo1NJWEen4',null)
}


/** addStream is used to set local stream to peer connection **/

function addStream(){
    if(remoteVideoSelector==null)return false;
    // get a local stream, show it in our video tag and add it to be sent
    if(localVideoStream != null){
        localVideoStream.stop();
    }
    const constraints = {
        audio: audioStatus?{deviceId: audioSource ? audioSource : "default"}:audioStatus,
        video: videoStatus?{deviceId: videoSource ? videoSource : "default"}:videoStatus
      };
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
        //rtcPeerConn.addTrack(track,stream);
        if(localVideoSelector){
            localVideoSelector.srcObject =localVideoStream;
        }
        return true;
      }).catch(err=>{
        alert("Camera device is not readable");
        return false;
      });
}

/** reconnectVideoCall is used to reconnect call when call dropped due to network fluctuations **/

function reconnectVideoCall(){
    if(videoCallUserId != 0 && SOCKET !== null){
        if(rtcPeerConn.iceConnectionState == "disconnected" || rtcPeerConn.iceConnectionState == "failed"){
            if(!isIncomingCall) {
                const offerOptions = {offerToReceiveAudio: 1,offerToReceiveVideo: 1,iceRestart:true};
                rtcPeerConn.createOffer(offerOptions).then((desc)=>{
                    rtcPeerConn.setLocalDescription(desc).then(()=> {
                        socket.emit('video_signal',{"type":"offer", 'offer': rtcPeerConn.localDescription, user_id : videoLoginUserId,'share_user_id' : videoCallUserId,room:ROOM});
                    }).catch(error=>{
                        console.log("setLocalDescription error",error)
                    });
                }).catch(err=>{
                    console.log("offer error",err)
                });
            }
        }
    }
}

/** sendLocalDesc method is used to send local offer to remote peer connection **/


function setReconnectingTimer(set){
    if(set){
        if(reconnectingTimer !== null){
            clearTimeout(reconnectingTimer);
            reconnectingTimer = null;
        }
        if(reconnectingInterval != null){
            clearInterval(reconnectingInterval);
            reconnectingInterval = null;
        }
        reconnectingTimer = setTimeout(function(){
            stopVideoCalling(true);
        },60000);

        reconnectingInterval = setInterval(function(){
            if(rtcPeerConn.iceConnectionState == "disconnected" || rtcPeerConn.iceConnectionState == "failed") {
                if(!isIncomingCall) {
                    const offerOptions = {offerToReceiveAudio: 1,offerToReceiveVideo: 1,iceRestart:true};
                rtcPeerConn.createOffer(offerOptions).then((desc)=>{
                        rtcPeerConn.setLocalDescription(desc).then(()=> {
                            socket.emit('video_signal',{"type":"offer", 'offer': rtcPeerConn.localDescription, user_id : videoLoginUserId,'share_user_id' : videoCallUserId,room:ROOM});
                        }).catch(error=>{
                            console.log("setLocalDescription error",error)
                        });
                    }).catch(err=>{
                        console.log("offer error",err)
                    });
                }
            }
        },10000);

    }else{
        if(reconnectingTimer !== null){
            clearTimeout(reconnectingTimer);
            reconnectingTimer = null;
        }

        if(reconnectingInterval != null){
            clearInterval(reconnectingInterval);
            reconnectingInterval = null;
        }
    }
}

function logError(error) {
    console.error(error.name + ': ' + error.message);
}
function getServers(){
    let data={};
    socket.emit('configuration',data,function(data){
        configurationVideocall=data;
        __this.onReady();
    })
}
function setCallEndTimer(time){
    let timeint=parseInt(time)*60000;
    setTimeout(() => {
        stopVideoCalling(true)
    }, timeint);
}
module.exports = CattleCall;
global.CattleCall = CattleCall;
window.CattleCall=CattleCall;