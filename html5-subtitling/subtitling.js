//Globar vars:
var mode = "playback";
var current_subtitle = null;
var current_title_sync;
var subtitles_textbox = [];
var autoskipback;
var autoskipback_ammount;
var autoskip_timeout;
var video;
var holdingkey=false;
var subtitles_p;
var current_step=1;

//---------------
function sendGETRequest(url, callback) {
 	var xhr = new XMLHttpRequest();
  var ajaxDataReader = function () {
    if (xhr.readyState == 4) {
      callback(xhr.responseText);
    }
  }

  xhr.open("GET", url, true);

  //https://developer.mozilla.org/En/Using_XMLHttpRequest#Bypassing_the_cache
  xhr.channel.loadFlags |= Components.interfaces.nsIRequest.LOAD_BYPASS_CACHE;

  xhr.onreadystatechange = ajaxDataReader;
  try {
      xhr.send(null);
    }
  catch(e){
//    alert("bad request");
  }
}

function sendPOSTRequest(url, params, callback) {
//alert("url: "+url);
//alert("params: "+params);
 	var xhr = new XMLHttpRequest();
  var ajaxDataReader = function () {
    if (xhr.readyState == 4) {
//alert("xhr.responseText: "+xhr.responseText);
      callback(xhr.responseText);
    }
  }

  xhr.open("POST", url, true);
  xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
  xhr.setRequestHeader("Content-length", params.length);
  xhr.setRequestHeader("Connection", 'close');

  xhr.onreadystatechange = ajaxDataReader;
  try {
      xhr.send(params);
    }
  catch(e){
//    alert("bad request");
  }
}

function save_article(articlename, content){
  var token = "+\\"; //this token is used for anonymous edits

//  alert("article: "+articlename+"\n\ncontent:\n\n\""+content+"\"");

  var display_result = function(data){
      //for debugging purpose only:
          //alert("result:\n\n"+data);
  }

  var params = "action=edit&title=" + encodeURIComponent(articlename) + "&section=0&text="+encodeURIComponent(content) + "&token=" + encodeURIComponent(token);

  sendPOSTRequest("../subs/api.php", params, display_result);
}

function load_article(pagename, callback){
  var parse_response = function(text){
    callback(text);
  }
    
  sendGETRequest("../subs/index.php?action=raw&title=" + pagename, parse_response);
}

//---------------


/* SRT (subtitles file format) parsing and encoding routines: */

function toMilliSeconds(s){
  var timeparts = s.split(',');
  msecs = Number(timeparts[1]);
  var timeparts = timeparts[0].split(':');
  var hours = Number(timeparts[0]);
  var mins = Number(timeparts[1]);
  var secs = Number(timeparts[2]);

  return (((hours*60 + mins) * 60) + secs)*1000 + msecs;
}

function MilliSecondsToString(time){
  var timeString;
  var hours = Math.floor(time / 3600000);
  var mins  = Math.floor(time % 3600000 / 60000);
  var secs  = Math.floor(time % 60000 / 1000);
  var msecs = time%1000;
  if (secs < 10) secs = "0" + secs;
  if (mins < 10) mins = "0" + mins;
  if (hours < 10) hours = "0" + hours;
  if (msecs < 10) msecs = "0" + msecs;
  if (msecs < 100) msecs = "0" + msecs;
  return hours + ":" + mins + ":" + secs + "," + msecs;
}

function encode_srt(sub){
  text = ""
  for (i in sub){
      text+=(Number(i)+1)+"\n"
      text+=this.MilliSecondsToString(sub[i]["start"])
      text+=" --> "
      text+=this.MilliSecondsToString(sub[i]["end"])+"\n";
      text+=sub[i]["text"]+"\n\n";
  }
  return text;
}

function step1(){
  current_step=1;
  document.getElementById("step1css").disabled = false;
  document.getElementById("step2css").disabled = true;
  document.getElementById("step3css").disabled = true;
}

function step2(){
  var transcript = document.getElementById("titles_textarea").value;
  if (current_step==1){
    var src = video.currentSrc;
//    if (!src) src = video.getElementsByTagName("source")[0].src;
    save_article("Transcript/URL/"+src, transcript);
  }
  current_step=2;
  document.getElementById("step1css").disabled = true;
  document.getElementById("step2css").disabled = false;
  document.getElementById("step3css").disabled = true;

  var titles = transcript.split('\n');
  var subs = [];
  for (i in titles){
    subs.push({"text": titles[i], "start":-1,"end":-1});
  }
  current_subtitle = {"content":subs};
  current_title_sync = 0;

  //restart playback:
  video.currentTime = 0;

  video.addEventListener('timeupdate', function(e){
    displaySubtitles_sync(e.target.currentTime*1000)
  }, false);

}

function step3(){
  if (current_step==2){
    var src = video.currentSrc;
//    if (!src) src = video.getElementsByTagName("source")[0].src;
    save_article("Subtitles/URL/"+src, encode_srt(current_subtitle["content"]));
  }
  current_step=3;
  document.getElementById("step1css").disabled = true;
  document.getElementById("step2css").disabled = true;
  document.getElementById("step3css").disabled = false;
}

function displaySubtitles_sync(){
  if (current_subtitle == null){
    subtitles_textbox[0].innerHTML = "[silence]";
    subtitles_textbox[1].innerHTML = "[silence]";
    subtitles_textbox[2].innerHTML = "[silence]";
    subtitles_textbox[3].innerHTML = "[silence]";
    subtitles_textbox[4].innerHTML = "[silence]";
    subtitles.innerHTML = "";
    return;
  }

  var subs = current_subtitle["content"];
  var currentTime = Math.round(video.currentTime * 1000);
  if (subs[0].start>=0 && currentTime < subs[0].start) current_title_sync = 0;

  for (i=0; i < subs.length; i++){
    if ((subs[i].start != -1) && (currentTime >= subs[i].start) && ((currentTime < subs[i].end) || (subs[i].end==-1))){
      current_title_sync = i+1;
      break;
    }
  }

  var i = current_title_sync-1;
  subtitles_textbox[0].innerHTML = (i-2>=0 && subs[i-2]["text"] != "") ? subs[i-2]["text"] : "[silence]";
  subtitles_textbox[1].innerHTML = (i-1>=0 && subs[i-1]["text"] != "") ? subs[i-1]["text"] : "[silence]";
  subtitles_p.innerHTML = subtitles_textbox[2].innerHTML = (i>=0 && i < subs.length && subs[i]["text"] != "") ? subs[i]["text"] : "[silence]";
  if (subtitles_p.innerHTML == "[silence]") subtitles_p.innerHTML = ""
  subtitles_textbox[3].innerHTML = (i+1<subs.length && subs[i+1]["text"] != "") ? subs[i+1]["text"] : "[silence]";
  subtitles_textbox[4].innerHTML = (i+2<subs.length && subs[i+2]["text"] != "") ? subs[i+2]["text"] : "[silence]";
}

function setup_autoskip(){
  if (autoskip_timeout)
    clearTimeout(autoskip_timeout);

  autoskip_timeout = setTimeout( auto_skip, autoskipback_interval.value*1000);
}

function auto_skip(){                      
  if (autoskipback.checked && current_step==1){
    var newval = video.currentTime - autoskipback_ammount.value;
    video.currentTime = (newval >= 0 ? newval : 0);
    setup_autoskip();
  } else {
    if (autoskip_timeout)
      clearTimeout(autoskip_timeout);  
  }
}

function autoskip_clicked(event){
  if (autoskipback.checked) setup_autoskip();
}

function load(event){
  step1();

  video = document.getElementById("video");
  subtitles_p = document.getElementById("subtitles");

  subtitles_textbox.push(document.getElementById("title_1"));
  subtitles_textbox.push(document.getElementById("title_2"));
  subtitles_textbox.push(document.getElementById("title_3"));
  subtitles_textbox.push(document.getElementById("title_4"));
  subtitles_textbox.push(document.getElementById("title_5"));

  autoskipback = document.getElementById("autoskipback");
  autoskipback_ammount = document.getElementById("autoskipback-ammount");
  autoskipback_interval = document.getElementById("autoskipback-interval");

  autoskipback.addEventListener("click", autoskip_clicked, false);


  var select_key = function(value){
    switch (value){
      case "TAB": return 9;
      case "CTRL": return 17;
      case "[": return 219;
      case "]": return 221;
      case "SPACEBAR": return 32;
      case "|": return 220;
    }
  };

  function KeyUpHandler(event){
    holdingkey = false;

    var tap_key = select_key(document.getElementById("taphotkey").value);

    if (event.which == tap_key){
     if(current_title_sync == null) return;
      var subs = current_subtitle["content"];
      var now = Math.round(video.currentTime * 1000);
      if (current_title_sync>0) subs[current_title_sync-1].end = now;
      if (current_title_sync<subs.length){
        subs[current_title_sync].start = now;
        current_title_sync++;
      }
    }

  }

  function KeyDownHandler(event){
    if (holdingkey==true) return;
    holdingkey = true;

    var rewind_key = select_key(document.getElementById("rewindhotkey").value);
    var playpause_key = select_key(document.getElementById("playpausehotkey").value);

    if (event.which == rewind_key){
      var newval = video.currentTime - document.getElementById("rewindsecs").value;
      video.currentTime = (newval >= 0 ? newval : 0);
      //TODO: inhibit key event propagation (?)
    }

    if (event.which == playpause_key){
      if (video.paused || video.ended)
          self.video.play();
      else
          video.pause();
      //TODO: inhibit key event propagation (?)
    }

  };

  window.addEventListener("keydown", KeyDownHandler, false);
  window.addEventListener("keyup", KeyUpHandler, false);
  
}
