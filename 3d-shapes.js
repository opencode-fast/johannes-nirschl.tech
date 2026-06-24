function init3D() {
  const containers = document.querySelectorAll('.shape-container');
  
  containers.forEach(container => {
    const shapeType = container.dataset.shape || 'box';
    const accentColor = 0x3f5e51; // Urban green metallic

    const scene = new THREE.Scene();
    
    // Lighting for metallic feel
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);
    
    const pointLight = new THREE.PointLight(accentColor, 5, 50);
    pointLight.position.set(-5, -5, 5);
    scene.add(pointLight);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    // Add canvas to container
    container.appendChild(renderer.domElement);

    // Setup Geometry
    let geometry;
    switch(shapeType) {
        case 'chip': geometry = new THREE.BoxGeometry(2.4, 0.2, 2.4); break;
        case 'database': geometry = new THREE.CylinderGeometry(1.2, 1.2, 2, 32); break;
        case 'gridBox': geometry = new THREE.BoxGeometry(1.8, 1.8, 1.8, 4, 4, 4); break;
        case 'tetrahedron': geometry = new THREE.TetrahedronGeometry(1.5, 0); break;
        case 'octahedron': geometry = new THREE.OctahedronGeometry(1.5, 0); break;
        case 'dodecahedron': geometry = new THREE.DodecahedronGeometry(1.5, 0); break;
        case 'cone': geometry = new THREE.ConeGeometry(1.2, 2, 32); break;
        case 'capsule': geometry = new THREE.CylinderGeometry(0.8, 0.8, 1.5, 32); break;
        case 'flatTorus': geometry = new THREE.TorusGeometry(1.2, 0.4, 16, 100); break;
        case 'twistedKnot': geometry = new THREE.TorusKnotGeometry(1, 0.3, 100, 16, 2, 5); break;
        case 'wildKnot': geometry = new THREE.TorusKnotGeometry(1, 0.2, 128, 16, 5, 8); break;
        case 'torusKnot': geometry = new THREE.TorusKnotGeometry(1, 0.3, 128, 32, 3, 4); break;
        case 'cylinder': geometry = new THREE.CylinderGeometry(1.2, 1.2, 2, 32); break;
        case 'icosahedron': geometry = new THREE.IcosahedronGeometry(1.5, 0); break;
        case 'sphere': geometry = new THREE.SphereGeometry(1.3, 64, 64); break;
        case 'box': default: geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6); break;
    }

    // Fusion-style Sketch Grid
    const gridHelper = new THREE.GridHelper(20, 40, accentColor, 0xcccccc);
    gridHelper.rotation.x = Math.PI / 2; // Start flat facing camera (2D sketch plane)
    gridHelper.position.z = -2;
    gridHelper.material.opacity = 0.1;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    const group = new THREE.Group();
    scene.add(group);

    // 1. Sketch lines
    const edgesGeometry = new THREE.EdgesGeometry(geometry); // Looks more like CAD
    const lineMaterial = new THREE.LineBasicMaterial({ color: accentColor, linewidth: 2 });
    const lines = new THREE.LineSegments(edgesGeometry, lineMaterial);
    group.add(lines);

    // 2. Solid Body
    const solidMaterial = new THREE.MeshStandardMaterial({ 
        color: accentColor, 
        metalness: 0.8, 
        roughness: 0.2,
        transparent: true,
        opacity: 0 // Starts hidden
    });
    const solidMesh = new THREE.Mesh(geometry, solidMaterial);
    group.add(solidMesh);

    // Sketching Animation State
    const totalLines = edgesGeometry.attributes.position.count;
    edgesGeometry.setDrawRange(0, 0);
    
    let drawCount = 0;
    let state = 'sketching';
    let delayFrames = 30; // Pause after sketch before extruding

    // Mouse Interaction
    let targetRotX = 0;
    let targetRotY = 0;
    container.addEventListener('mousemove', (e) => {
        if (state !== 'done') return;
        const rect = container.getBoundingClientRect();
        const mouseX = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
        const mouseY = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;
        targetRotX = mouseY * 0.5;
        targetRotY = mouseX * 0.5;
    });

    // Animation Loop
    function animate() {
      requestAnimationFrame(animate);
      
      if (state === 'sketching') {
          // Fast sketch drawing
          drawCount += totalLines / 90; 
          edgesGeometry.setDrawRange(0, Math.min(drawCount, totalLines));
          
          if (drawCount >= totalLines) {
              if (delayFrames > 0) {
                  delayFrames--;
              } else {
                  state = 'extruding';
              }
          }
      } else if (state === 'extruding') {
          // Fade in solid body
          solidMesh.material.opacity += 0.02;
          
          // Tilt grid to 3D floor
          gridHelper.rotation.x -= 0.01;
          if (gridHelper.rotation.x <= 0.2) gridHelper.rotation.x = 0.2;
          
          // Rotate object into 3D isometric view
          group.rotation.x += 0.01;
          group.rotation.y += 0.01;
          
          if (solidMesh.material.opacity >= 1) {
              state = 'done';
          }
      } else if (state === 'done') {
          // Continuous slow rotation + mouse follow
          group.rotation.x += (targetRotX - group.rotation.x) * 0.05 + 0.002;
          group.rotation.y += (targetRotY - group.rotation.y) * 0.05 + 0.005;
      }
      
      renderer.render(scene, camera);
    }
    animate();

    // Handle Resize
    window.addEventListener('resize', () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init3D);
} else {
  init3D();
}
