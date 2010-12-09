#!/usr/bin/env python

import usb.core
import usb.util
import math
PI=3.1415

class LaserDisplay():
#------ Configuration flags ------

  # Note that these are named according to what we think they do.
  # Maybe they do something completely different. 
  ALWAYS_ON = 1
  SOMETHING = 2

#------ Initialization of the device ------

  def __init__(self):
    # find our device
    self.usbdev = usb.core.find(idVendor=0x9999, idProduct=0x5555)

    # was it found?
    if self.usbdev is None:
        raise ValueError('Device not found')

    # set the active configuration. With no arguments, the first
    # configuration will be the active one
    self.usbdev.set_configuration()

    # get an endpoint instance
    self.ep = usb.util.find_descriptor(
            self.usbdev.get_interface_altsetting(),   # first interface
            # match the first OUT endpoint
            custom_match = \
                lambda e: \
                    usb.util.endpoint_direction(e.bEndpointAddress) == \
                    usb.util.ENDPOINT_OUT
        )

    assert self.ep is not None

    self.initflags = 0
    self.deinitflags = 0

    # Just a configuration to have a stable laser output. We have to look into this
    self.ep.write([0xca, 0x2a]);

    self.set_color([0xFF,0x00,0x00])

#------ Configuration functions that affect the message generation ------

  def set_init_flags(self, flags):
    self.init_flags = flags

  def set_deinit_flags(self, flags):
    self.deinit_flags = flags

  def set_color(self, c):
    self.color = {"R": c[0], "G": c[1], "B": c[2]}

#------ Message generation methods. You can use the generated messages to draw something ------
  
  def line_message(self, x1, y1, x2, y2):
    return [x1, 0x00, y1, 0x00,                                                 # First DWord is point one position
            self.color["R"], self.color["G"], self.color["B"], self.init_flags, # Configuration for the first point
            x2, 0x00, y2, 0x00,                                                 # Position of the second point
            self.color["R"], self.color["G"], self.color["B"], deinit_flags]    # Second point's config

  def point_message(self, x, y):
    return [x, 0x00, y, 0x00, self.color["R"], self.color["G"], self.color["B"], self.flags]

  def bezier_message(self, points, steps):
    if len(points) < 3:
      print "Quadratic Bezier curves have to have at least three points"
      return

    step_inc = 1.0/(steps)

    message = []
    self.set_flags(0x03)
    message += self.point_message(points[0][0], points[0][1])
    self.set_flags(0x00)

    for i in range(0, len(points) - 2, 2):
      t = 0.0
      t_1 = 1.0
      for s in range(steps):
        t += step_inc
        t_1 = 1.0 - t
        if s == steps - 1 and i >= len(points) - 2:
          self.set_flags(0x02)
        message += (self.point_message(t_1 * (t_1 * points[i]  [0] + t * points[i+1][0]) + \
                                       t   * (t_1 * points[i+1][0] + t * points[i+2][0]),  \
                                       t_1 * (t_1 * points[i]  [1] + t * points[i+1][1]) + \
                                       t   * (t_1 * points[i+1][1] + t * points[i+2][1])))

#------ Message generation methods. You can use the generated messages to draw something ------

  def draw(message):
    self.ep.write(message)

  def draw_line(self, x1, y1, x2, y2):
    self.ep.write(self.line_message(x1, y1, x2, y2))

#------ XXX: Are the following methods needed? ------

  #TODO: refactor it. It should not be in our API
  def draw_dashed_circle(self, x,y,r, c1, c2):
    step = 32
    for alpha in range(step):
      if alpha%2:
        self.set_color(c1)
      else:
        self.set_color(c2)
        
      self.ep.write(self.line_message(x + r*math.cos(alpha*2*PI/step), y + r*math.sin(alpha*2*PI/step), x + r*math.cos((alpha+1)*2*PI/step), y + r*math.sin((alpha+1)*2*PI/step)))

  def start_frame(self):
    self.messageBuffer = []

  def end_frame(self):
    self.ep.write(self.messageBuffer)

  def schedule(self, message):
    for byte in message:
      self.messageBuffer.append(byte)
