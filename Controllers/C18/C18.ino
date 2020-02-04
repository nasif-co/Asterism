#include <SparkFun_TB6612.h>
#include <XBee.h>
#include <Printers.h>

//Motor Pins    CHECK for each pot
#define AIN1 11
#define AIN2 10
#define PWMA 9
#define STBY 12
const int offsetA = 1; //direction of the motor (positive = right, negative = left)
Motor motor1 = Motor(AIN1, AIN2, PWMA, offsetA, STBY); //initialize motor

//XBee
XBeeWithCallbacks xbee; //XBee object with callbacks enabled
XBeeAddress64 coordAddr = XBeeAddress64(0x0013A200, 0x40E66DD8); // 64bit address to send to (set to all 0's for coordinator)
uint16_t coordAddr16 = 0x0000;

//Control
int maxResistance = 900;
int minResistance = 10;
int lowLim = 245;
int hiLim = 255;
int pos = 250;
int prevPos = 250;
int lastSentPos = 250;
bool updating = false;
unsigned long movingTimer = 0;
unsigned long sendTimer = 0;
const int maxTimeToUpdate = 1000;
const int sendInterval = 200;
String me = "C18"; //           CHANGE FOR EACH XBEE
bool sliding = true;
bool sending = false;

void setup() {
  Serial.begin(9600);
  Serial1.begin(115200);

  xbee.begin(Serial1); //Apply software serial for XBee
  xbee.onZBRxResponse(processRxPacket);

  pinMode(A3, INPUT);

  /* Check Limits:
    Was used to automatically calibrate the max and min of the pot.
    but was commented because if the user is holding the pot/string
    when turning on, it will trump the calibration

    motor1.drive(100,300);
    motor1.brake();
    delay(200);
    maxResistance = analogRead(A3);
    motor1.drive(-100,300);
    motor1.brake();
    delay(200);
    minResistance = analogRead(A3);
  */
}

void loop() {
  xbee.loop(); //Reads XBee

  filter(); //Used to read and filter the potentiometer readings.
  checkSliding(); //Check if the pot is being moved

  //Update if global position changed and nobody is blocking movement
  if (updating) {

    if (pos >= lowLim && pos <= hiLim) {
      motor1.brake();
      if (!sliding) {
        updating = false;
      }
    } else if (pos > hiLim) {
      motor1.drive(-map(abs(pos - hiLim), 0, 500, 70, 200));
    } else if (pos < lowLim) {
      motor1.drive(map(abs(pos - lowLim), 0, 500, 70, 200));
    }

    if (millis() - movingTimer > maxTimeToUpdate) {
      sendPack("STR|" + me + "|POS|" + String(pos) + " ", coordAddr, coordAddr16);
      lastSentPos = pos;
      movingTimer = millis();
    }

  } else { //If slider was moved by a user

    //      (send data in intervals↓)                (pos has not been sent↓)
    if ((millis() - sendTimer > sendInterval) && (abs(pos - lastSentPos) > 3)) {
      sendPack("CON|" + me + "|POS|" + String(pos) + " ", coordAddr, coordAddr16);
      lastSentPos = pos;
      sending = true;
      //Serial.println("                     " + String(pos) + "                  ");
      sendTimer = millis();
    }

    if (sending && !sliding) {
      sendPack("FINAL|" + me + "|POS|" + String(pos) + " ", coordAddr, coordAddr16);
      lastSentPos = pos;
      sendTimer = millis();
      sending = false;
    }

  }
  //Serial.println("Sending: "+ String(sending), "Sliding: " + String(sliding));
  prevPos = pos;
}

void processRxPacket(ZBRxResponse& rx, uintptr_t) { //callback that processes the Received packet
  String got = ""; //String that will store data received. It is cleared before getting new data
  for (int i = 0; i < rx.getDataLength(); i++) { //read through each of the data bytes (more info: pg 129 Faludi,R. 2012)
    got += char(rx.getData(i)); //stores data into a String
  }
  String type = getValue(got, '|', 0);
  String owner = getValue(got, '|', 1);
  String value = getValue(got, '|', 2);
  if (type == "CON") {
    lowLim = constrain(value.toInt() - 3, 0, 500);
    hiLim = constrain(value.toInt() + 3, 0, 500);
    lastSentPos = value.toInt();
    //Serial.println("gotIt      "+String(lowLim)+"       "+String(pos)+"        "+String(hiLim));

    if (owner != me) {
      updating = true;
      movingTimer = millis();
      //Serial.println("notMe!");
    }
  }
}

void sendPack(String message, XBeeAddress64 addr64, uint16_t addr16 ) { //function to send Tx Requests (data packets)
  ZBTxRequest txRequest; // object that will hold the packet
  txRequest.setFrameId(0);
  txRequest.setOption(1);
  txRequest.setAddress64(addr64); // xbee address to send to
  txRequest.setAddress16(addr16); // set the 16bit address
  uint8_t payload[message.length()]; //create payload that will have the message as bytes
  message.toCharArray(payload, message.length()); //add the message as bytes to the payload
  txRequest.setPayload(payload, sizeof(payload)); //One of the ways to create the packet

  // And send it
  xbee.send(txRequest);
}


String getValue(String data, char separator, int index) { //function to split strings by separator
  //source: https://stackoverflow.com/questions/9072320/split-string-into-string-array
  int found = 0;
  int strIndex[] = {0, -1};
  int maxIndex = data.length() - 1;

  for (int i = 0; i <= maxIndex && found <= index; i++) {
    if (data.charAt(i) == separator || i == maxIndex) {
      found++;
      strIndex[0] = strIndex[1] + 1;
      strIndex[1] = (i == maxIndex) ? i + 1 : i;
    }
  }

  return found > index ? data.substring(strIndex[0], strIndex[1]) : "";
}

unsigned long moveTimer = 0;
const int moveSensitivity = 300;


void checkSliding() {
  if (abs(pos - prevPos) > 0) { //Change 0 to be more forgiving
    moveTimer = millis();
  }

  if (millis() - moveTimer > moveSensitivity) { //Has not moved in a while
    sliding = false;
    //Serial.println("Stopped");
    digitalWrite(LED_BUILTIN, LOW);
  } else {
    sliding = true;
    //Serial.println("sliding");
    digitalWrite(LED_BUILTIN, HIGH);
  }
}

void filter() { //Formula made by Mads Hobye (http://www.hobye.dk/)
  int raw = map(analogRead(A3), minResistance, maxResistance, 0, 500);
  pos = constrain(pos * 0.9 + raw * 0.1, 0, 500);
  Serial.println(pos);
}
