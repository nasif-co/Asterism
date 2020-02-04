# Controller Code <sup>[Arduino][C++]</sup> 
The controllers are built using Arduino as the MCU. Here you can find an *almost* line-by-line code explanation of how they work and how they communicate with the slider and the server through XBee.

## Setup
```c++
void setup() {
  Serial.begin(9600);
  Serial1.begin(115200);

  xbee.begin(Serial1); //Apply software serial for XBee
  xbee.onZBRxResponse(processRxPacket);

  pinMode(A3, INPUT);
}
```
For this project, I decided to use and Arduino Pro Micro due to its two serial ports:

* Serial: connected to USB out for communication with the computer.
* Serial1: connected to pins 0 (RX) and 1 (TX).

This means we can have the Arduino communicate with the XBee on a hardware serial port (avoiding the speed problems of using Software-Serial) and communicate with it from the computer at the same time, for debugging. Therefore, this setup begins by starting our communication serial port at 9600 baud and the XBee communication serial port at 115200 baud. 

Afterwards, we begin communication with the XBee object by attaching Serial1 to it and then set a callback for the event 'onZBRxResponse'. This is the event that occurs whenever a message is received, calling the function processRxPacket which is in charge of parsing the data and executing the appropriate instructions. We will look into this function later on.

Finally, we set pin A3 as INPUT, since we will read the slide potentiometer position through this pin.

## Loop and Custom Functions

```c++
void loop() {
  xbee.loop(); //Reads XBee

  filter(); //Used to read and filter the potentiometer readings.
  checkSliding(); //Check if the pot is being moved
```

The first line of the loop is in charge of refreshing the XBee, reading the messages as they come. For this reason, we want this to happen as soon as possible, which is why we must strive to use non-blocking code. This is the reason why no delay() calls are used in the code.

Then we call the custom filter function:

```c++
void filter() { //Formula made by Mads Hobye (http://www.hobye.dk/)
  int raw = map(analogRead(A3), minResistance, maxResistance, 0, 500);
  pos = constrain(pos * 0.9 + raw * 0.1, 0, 500);
  Serial.println(pos);
}
```
This is the same formula Natalia used to smooth out capacitance readings in "Terrain d'Entente". Here we use it to smooth out the potentiometer readings (this is also supported by a small capacitor to ground soldered at the input pin). We first read the pin and map the value to receive something between 0 and 500. Then, we update the global pos variable using smoothing, by adding 90% of the previous pos value and 10% of the newly read raw value (and constraining between 0 and 500). This way, the change between the previous pos and the new pos happens gradually.

After having read and filtered the potentiometer, we call checkSliding():

```c++
void checkSliding() {
  if (abs(pos - prevPos) > 0) { //Change the 0 to be more forgiving
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
```

The first 'if' checks if there is a difference between the current position of the potentiometer and it's previous one. If so, it sets *moveTimer* to the current sketch millis time. This line of code gets called every frame, as long as the potentiometer is moving, which is why the next 'if' asks how much time has passed since the code executed that line (ie. How long ago did the slider last move?). If it has been more than the time stored in the moveSensitivity variable:

```c++
const int moveSensitivity = 600;
```

Then we asume it is not sliding (sliding = false). If less time has passed, we asume it is currently sliding (sliding = true).

### Sending values
Up until now, the code is capable of reading and filtering the pot position, as well as telling if it is currently being moved or not. Now we skip the beggining of the next 'if' and jump to the 'else' on line 86:

```c++
else { //If slider was moved by a user

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
```
This 'else' refers to when the slider has been moved by the user, rather than by having received a message (which is what the first part of the 'if' covers and what we will look into after this section). 

Inside this 'else' we ask for two conditions:
  * The current position (pos) is different from the last sent value for position (lastSentPos) (ie. We are at a new position that has not been sent)
  * A certain interval of time has passed since we last sent a position. This interval is defined by the variable:
  ```c++
  const int sendInterval = 200;
  ```
  
If these two conditions are met, we proceed to send a message to the server. This is done using the prebuilt *sendPack* function and feeding it a string in the predetermined format (see teamfeed), as well as the XBee cordinator 64bit and 16bit address. We then update *lastSentPos* and set 'sending' as true, meaning that we are currently in the process of sending position values as the person slides the pot. Finally, we reset the *sendTimer*, so the next message is sent respecting the time interval defined by the *sendInterval* variable.

Once the slider stops being moved, the sliding variable will become false and so the code will enter the second 'if'. This part is meant to send a FINAL message to the server, indicating the final position the slider reached in this instance of movement. With this in mind, this part works almost identically to the one before it, except that it sets sending as false, since this message ends the process of sending values.

### Receiving values
Now we must take a look at how the arduino receives messages through the XBee. As we saw in the setup, we established *processRxPacket* as the callback function whenever a message is received:

```c++
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
```

Here we start by creating *got*, a String in which we write each byte of data received, one by one, by using a for loop. Next, we split *got* by its delimiter: '|', using the getValue() function [that we got here](https://stackoverflow.com/questions/9072320/split-string-into-string-array). Lastly we process the data we got:

If its type is CON, it means it is a Sync Message we got from the coordinator. This means we have received the instruction of updating the position of the slider to sync up to the position received. However, because moving the slider with the motor is not 100% precise, we must leave a margin of error. For this reason, we do not set a single 'newPos' variable, but rather a range with a lower limit (lowLim) and a higher limit (hiLim) that the slider cannot surpass. With these two, we create a 6 unit range in which the slider can sit. 

After defining this, the lastSentPos is updated to the received position and we ask if the owner of the message we received is this same module. If it is, it means this instruction MUST be ignored. Therefore, the *updating* boolean will stay as false since we do NOT need to update our position. 

If, on the contrary, the owner is not this same module, we must heed the instruction so as to sync to the owner. Hence, *updating* is set to true, and it works as a flag that tells the program that it must update its position to reach the lowLim-hiLim range. 

Here, the program also resets the *movingTimer*, which counts how much time has passed since the message received the instruction to move.

Having received the message and set the flags and values to execute the instruction, we go back to line 67 inside the loop:

```c++
if (updating) {

    if (pos >= lowLim && pos <= hiLim) {
      motor1.brake();
      if (!sliding) {
        updating = false;
      }
    } else if (pos > hiLim) {
      motor1.drive(-map(abs(pos - hiLim), 0, 500, 70, 230));
    } else if (pos < lowLim) {
      motor1.drive(map(abs(pos - lowLim), 0, 500, 70, 230));
    }

    if (millis() - movingTimer > maxTimeToUpdate) {
      sendPack("STR|" + me + "|POS|" + String(pos) + " ", coordAddr, coordAddr16);
      lastSentPos = pos;
      movingTimer = millis();
    }

  }
```

The first thing we ask is if *updating* is true (ie. if we have received a message with a new position we must sync to). Now the first internal 'if' asks if we have already reached a position inside the lowLim-hiLim range. If we have, the motor brakes, and we set updating as false, since we have succesfully updated the position. 

If, on the contrary, we are above the limit, the motor must move backwards in a speed proportional to its distance from the closest limit. Hence, if we are far away, it will move fast and gradually decrease speed to come to a stop inside the range.

Else, if we are below the limit, the motor must move forward in a speed proportional to its distance from the closest limit.

The last internal 'if' has a key role: it checks how much time has passed since we received the position. In other words, it keeps track of how long the module has been trying to reach the new position. On average, the module should take less than:

```c++
const int maxTimeToUpdate = 1200; // 1.2 seconds
```
If it takes more than that, it means there is a struggle going on. Someone is fighting with this position and trying to set a new position of their own. When this happens, the code proceeds to inform the server, sending a Struggle Message. Once done, the code then updates the lastSentPos, and resets the moving timer to exit this 'if'.

The server then takes care of how the struggles are managed, and sends the respective messages that can be processed by the *processRxPacket* in the same way as the Sync Messages.

Finally, the loop ends with the following line:
```c++
prevPos = pos;
```
Making sure we have an updated value for the previous position, as this is used to detect movement in the *checkSliding* function.

## Notes
* Right now, the values the potentiometer moves in are mapped and constrained inside a 0-500 range. This gives it a lot of stability, but loses the change to have a larger range. For the moment it works nicely, since we are using but three bulbs. However, once the full set of 15 bulbs is put into motion, we will have to consider making this a larger range, so as to have better control over the movement of the light object.
* This is a general explanation of how the code works. However, you may find that the code for each controller has a different value for this or that variable. This is due to trial and error. In testing each slider we found differences that we had to take into account when defining the specific values used in each variable.
* For clarity, I consider the prefix CON used in the Sync messages has to be changed to SYNC. This requires a change in the *processRxPacket* function.
* After soldering the circuits, I realized that some of the sliders will be facing towards the Rue René Levesque, while others will be facing the other way. This means some of the controllers must be mirrored. To resolve this, we chose to add a small two-position switch, that lets you mirror the controller if necessary. However, THIS HAS NOT YET BEEN ADDED TO THE CIRCUITS.
