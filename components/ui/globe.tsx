"use client";

import { useEffect, useRef } from "react";
import Globe from "three-globe";
import * as THREE from "three";

export function World({ data, globeConfig }: any) {
  const globeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!globeRef.current) return;

    const globe = new Globe()
      .globeImageUrl("//unpkg.com/three-globe/example/img/earth-dark.jpg")
      .arcsData(data)
      .arcColor("color")
      .arcAltitude("arcAlt")
      .arcStroke(0.5)
      .arcDashLength(0.9)
      .arcDashGap(4)
      .arcDashAnimateTime(1000);

    globeRef.current.innerHTML = "";

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(
      globeRef.current.clientWidth,
      globeRef.current.clientHeight
    );

    globeRef.current.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(globe);

    const camera = new THREE.PerspectiveCamera(
      75,
      globeRef.current.clientWidth / globeRef.current.clientHeight,
      0.1,
      1000
    );

    camera.position.z = 300;

    const animate = () => {
      requestAnimationFrame(animate);
      globe.rotation.y += 0.001;
      renderer.render(scene, camera);
    };

    animate();
  }, [data]);

  return <div ref={globeRef} className="w-full h-full" />;
}