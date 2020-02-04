let socket;
let pos = 0;
let smoothPos = 0;
let drag = 0.75;
let strength = 0.05;
let vel = 0;
let monoSp;
let sansSer;

let messageType = [];
let messageOwner = [];
let messageValue = [];
let messageDate = [];
let messageTime = [];
let alph;

let orange;
let blue;
let bgColor;
let sunDown = false;
let prevSunDown = false;
let browserColor;

var icns = [];
function preload(){
	monoSp = loadFont('assets/ibmmonobold.ttf')
	sansSer = loadFont('assets/ibmsansbold.ttf')
	icns[0]=loadImage('assets/0.png')
	icns[1]=loadImage('assets/1.png')
	icns[2]=loadImage('assets/2.png')
}


function setup() {
	orange = color(255,103,0);
	blue = color(0,0,99);
	bgColor = orange;
	browserColor = select('#browserColor');
	var canvas = createCanvas(windowWidth, windowHeight);	
	background(255,103,0);
	socket = io.connect(window.location.pathname); //connect to the socket
	socket.on('CON', controllerMessage);
	socket.on('FINAL', controllerMessage);
	socket.on('STR', controllerMessage);
	socket.on('INIT', initializeVisualization);
	socket.on('TIMES', catchTimes);
}

function draw() {
	smoothPosition();
	background(bgColor);
	if(smoothPos<125){
		alph=map(smoothPos,0,124,0,255);
	}else if(smoothPos>375){
		alph=map(smoothPos,376,500,255,0);
	}else{
		alph=255;
	}
	lightObject(map(smoothPos,0,500,width,4*width/8),height/5,alph)
	if(smoothPos>=-3&&smoothPos<=125){
		bulb(7*width/8,height/5,2,map(smoothPos,0,125,0,255));
		bulb(6*width/8,height/5,2,0);
		bulb(5*width/8,height/5,2,0);
	}else if(smoothPos>125&&smoothPos<=250){
		bulb(7*width/8,height/5,2,map(smoothPos,126,250,255,0));
		bulb(6*width/8,height/5,2,map(smoothPos,126,250,0,255));
		bulb(5*width/8,height/5,2,0);
	}else if(smoothPos>250&&smoothPos<=375){
		bulb(7*width/8,height/5,2,0);
		bulb(6*width/8,height/5,2,map(smoothPos,251,375,255,0));
		bulb(5*width/8,height/5,2,map(smoothPos,251,375,0,255));
	}else if(smoothPos>375){
		bulb(7*width/8,height/5,2,0);
		bulb(6*width/8,height/5,2,0);
		bulb(5*width/8,height/5,2,map(smoothPos,376,500,255,0));
	}else{
		bulb(7*width/8,height/5,2,0);
		bulb(6*width/8,height/5,2,0);
		bulb(5*width/8,height/5,2,0);
	}

  //Show last 10 messages from controllers:
  for(var i = 0;i<messageType.length;i++){
  	fill(255,255-(i*25.5));
  	textFont(monoSp);
  	textSize(15);
  	text(messageOwner[i],width/6,(height/2-35)+(35*i));

  	textSize(11);
  	text(messageDate[i],width/6+100,(height/2-48)+(35*i));
  	text(messageTime[i],width/6+100,(height/2-35)+(35*i));
  	

  	textSize(31)
  	textFont(sansSer);
  	text(messageValue[i],width/6+35,(height/2-35)+(35*i));

  	tint(255,255-(i*25.5))
  	image(icns[messageType[i]],width/6,((height/2-35)-25)+35*i,25,11.635);
  }

}

function controllerMessage(data){
	console.log('owner: '+data.own+' position: '+data.pos);
	pos = data.pos;
	messageOwner.unshift(data.own);
	messageType.unshift(data.typeId);
	messageValue.unshift(data.pos);
	messageTime.unshift(data.timeStamp);
	messageDate.unshift(data.dateStamp);

	if(messageType.length>10){
		messageType.length=10;
		messageOwner.length=10;
		messageValue.length=10;
		messageDate.length=10;
		messageTime.length=10;
	}
}

function initializeVisualization(data){
	if(millis()<3000){
		for(let i = 0 ; i < data.message.length ; i++){
			messageOwner[i] = data.message[i].own;
			messageType[i] = data.message[i].typeId;
			messageValue[i] = data.message[i].pos;
			messageTime[i] = data.message[i].timeStamp;
			messageDate[i] = data.message[i].dateStamp;
		}
		pos = messageValue[0];
		smoothPos = pos;
	}
}

function catchTimes(data){
	sunDown = data.time;

	if(prevSunDown!=sunDown){
		if(millis()<3000){
			prevSunDown=sunDown;
			if(sunDown){
				bgColor = blue;
			}else{
				bgColor = orange;
			}
			browserColor.attribute('content',bgColor.toString('#rrggbb'));
		}else{
			if(sunDown){
				for(let i = 0; i < 10000; i+=100){
					setTimeout(function(){bgColor=lerpColor(orange,blue,i/10000);browserColor.attribute('content',bgColor.toString('#rrggbb'));},i);
				}
			}else{
				for(let i = 0; i < 10000; i+=100){
					setTimeout(function(){bgColor=lerpColor(blue,orange,i/10000);browserColor.attribute('content',bgColor.toString('#rrggbb'));},i);
				}
			}
		}
	}

	prevSunDown = sunDown;
}


function bulb(x,y,mult,brightness){
	stroke(255);
	strokeWeight(1.5*mult);
	line(x,y,x,-10);
	fill(255,255);
	noStroke();
	ellipseMode(RADIUS);
	ellipse(x,y-(6*mult),3*mult,3*mult);
	beginShape();
	vertex(x-3*mult,y-6*mult);
	vertex(x-3*mult,y-3*mult);
	vertex(x-2*mult,y-3*mult);
	vertex(x-2*mult,y-2*mult);
	vertex(x-5*mult,y+1*mult);
	vertex(x-5*mult,y+6*mult);
	vertex(x-4*mult,y+6*mult);
	vertex(x-4*mult,y+7*mult);
	vertex(x+4*mult,y+7*mult);
	vertex(x+4*mult,y+6*mult);
	vertex(x+5*mult,y+6*mult);
	vertex(x+5*mult,y+1*mult);
	vertex(x+2*mult,y-2*mult);
	vertex(x+2*mult,y-3*mult);
	vertex(x+3*mult,y-3*mult);
	vertex(x+3*mult,y-6*mult);
	endShape(CLOSE)
	rect(x-5*mult,y+7*mult,10*mult,3*mult);
	fill(255,224,0,brightness);
	beginShape();
	vertex(x-5*mult,y+7*mult);
	vertex(x+5*mult,y+7*mult);
	vertex(x+120*mult,windowHeight);
	vertex(x-120*mult,windowHeight);
	endShape(CLOSE);
}

function lightObject(x,y,show){
	for(var i = 10; i>0 ; i--){
		fill(255,224,0,show-(i*25.5));
		ellipse(x,y,6*i,6*i);
	}
}

function smoothPosition(){
	let force = pos - smoothPos;
	force *= strength;
	vel *= drag;
	vel += force;
	smoothPos += vel;
}

//To send message:
/*
var data = { //create JSON
	data1: variable,
	data2: variable,
	...
	dataN: variable
}

socket.emit('messageName', data);
*/

//To redirect:
/*
var newURL = "https://s12621.p20.sites.pressdns.com";
window.location = newURL;
*/
