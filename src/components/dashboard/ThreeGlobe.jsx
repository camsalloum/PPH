import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

const ThreeGlobe = () => {
  const mountRef = useRef(null);
  
  useEffect(() => {
    if (!mountRef.current) return;
    
    // Scene, camera and renderer setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    renderer.setSize(80, 80);
    renderer.setClearColor(0x000000, 0);
    
    // Add renderer to DOM
    mountRef.current.appendChild(renderer.domElement);
    
    // Create globe
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    
    // Earth texture - using existing 8k_earth.jpg with error handling
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(
      '/assets/8k_earth.jpg',
      // Success callback
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
      },
      // Progress callback
      undefined,
      // Error callback
      (error) => {
        console.error('Failed to load earth texture:', error);
        // Create a fallback material without texture
        const fallbackMaterial = new THREE.MeshBasicMaterial({ color: 0x4a90e2 });
        globe.material = fallbackMaterial;
      }
    );
    
    const material = new THREE.MeshBasicMaterial({
      map: texture
    });
    
    const globe = new THREE.Mesh(geometry, material);
    scene.add(globe);
    
    // Position camera
    camera.position.z = 2.2;
    
    // Animation loop
    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      
      // Rotate globe
      globe.rotation.y += 0.005;
      
      renderer.render(scene, camera);
    };
    
    animate();
    
    // Clean up on unmount
    return () => {
      cancelAnimationFrame(animationFrameId);
      
      // Safely remove DOM element
      if (mountRef.current && renderer.domElement && mountRef.current.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
      
      // Dispose resources
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
    };
  }, []);
  
  return (
    <div ref={mountRef} style={{ width: '80px', height: '80px', margin: '0 auto' }}></div>
  );
};

export default ThreeGlobe; 