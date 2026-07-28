"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;
uniform float uTime;
uniform vec2 uPointer;
uniform vec2 uResolution;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0; float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p); p = p * 2.03 + vec2(17.1, 9.2); amplitude *= 0.5;
  }
  return value;
}
void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float time = uTime * 0.055;
  float flow = fbm(p * 2.4 + vec2(time, -time * 0.7));
  float detail = fbm(p * 5.0 - vec2(time * 1.4, time));
  float vein = 1.0 - smoothstep(0.035, 0.12, abs(flow - 0.53 + detail * 0.08));
  vec2 pointer = (uPointer - 0.5) * vec2(aspect, 1.0);
  float proximity = exp(-3.2 * distance(p, pointer));
  vec3 obsidian = mix(vec3(0.025, 0.025, 0.03), vec3(0.12, 0.12, 0.13), flow * 0.65);
  vec3 lime = vec3(0.85, 1.0, 0.0) * vein * (0.08 + proximity * 0.22);
  float vignette = smoothstep(1.05, 0.18, distance(uv, vec2(0.5)));
  gl_FragColor = vec4((obsidian + lime) * (0.65 + vignette * 0.45), 1.0);
}
`;

export function ObsidianFlow() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const uniforms = {
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0.68, 0.42) },
      uResolution: { value: new THREE.Vector2(1, 1) },
    };
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    container.appendChild(renderer.domElement);
    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height, false);
      uniforms.uResolution.value.set(width, height);
    };
    const move = (event: PointerEvent) => {
      uniforms.uPointer.value.set(event.clientX / innerWidth, 1 - event.clientY / innerHeight);
    };
    resize();
    addEventListener("resize", resize);
    addEventListener("pointermove", move, { passive: true });
    let frame = 0;
    const start = performance.now();
    const render = (now: number) => {
      uniforms.uTime.value = (now - start) / 1000;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("resize", resize);
      removeEventListener("pointermove", move);
      material.dispose();
      mesh.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return <div className="obsidian-flow" ref={host} aria-hidden="true" />;
}
