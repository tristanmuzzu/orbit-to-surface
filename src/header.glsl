#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
uniform vec2  uRes;
uniform vec2  uJitter;
uniform vec3  uCamPos;
uniform mat3  uCam;        // columns: right, up, forward
uniform float uTanFov;     // tan(half vertical fov)
uniform vec3  uSun;
uniform float uTime;
uniform float uPix;        // angle of one pixel, radians
uniform float uFrame;
uniform int   uSteps;
uniform int   uShadowSteps;
uniform int   uCloudSteps, uAtmoSteps;
uniform vec3  uHoleA, uHoleB;   // ends of the gap the camera dives through, on the sea-level sphere
uniform sampler3D uNoise;
out vec4 outColor;
