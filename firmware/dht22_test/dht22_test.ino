#include <DHT.h>
  
  #define DHTPIN 4      // D4 on ESP32 (GPIO5)
  #define DHTTYPE DHT22
  
  DHT dht(DHTPIN, DHTTYPE);
  
  void setup() {
    Serial.begin(115200);
    dht.begin();
  }
  
  void loop() {
    float h = dht.readHumidity();
    float t = dht.readTemperature();       // Celsius
    float f = dht.readTemperature(true);   // Fahrenheit
  
    if (isnan(h) || isnan(t) || isnan(f)) {
      Serial.println("DHT22 read failed");
      delay(2000);
      return;
    }
  
    Serial.print("Humidity: ");
    Serial.print(h, 1);
    Serial.print("%  Temp: ");
    Serial.print(t, 1);
    Serial.print("C  ");
    Serial.print(f, 1);
    Serial.println("F");
  
    delay(2000);
  }