import * as Cesium from 'cesium';

// Initialize Cesium viewer
const viewer = new Cesium.Viewer('cesiumContainer', {
    terrainProvider: Cesium.createWorldTerrain(),
    homeButton: false,
    sceneModePicker: false,
    baseLayerPicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    geocoder: false
});

// Custom country data with your preferred names
const customCountries = [
    {
        position: Cesium.Cartesian3.fromDegrees(-95.0, 40.0, 1000000), // USA center
        name: "United States of America",
        originalName: "USA"
    },
    {
        position: Cesium.Cartesian3.fromDegrees(2.0, 46.0, 1000000), // France center
        name: "République Française",
        originalName: "France"
    },
    {
        position: Cesium.Cartesian3.fromDegrees(138.0, 36.0, 1000000), // Japan center
        name: "Land of the Rising Sun",
        originalName: "Japan"
    },
    {
        position: Cesium.Cartesian3.fromDegrees(55.0, 25.0, 1000000), // UAE center
        name: "Emirates Federation",
        originalName: "UAE"
    }
];

// Add custom country labels
customCountries.forEach(country => {
    viewer.entities.add({
        position: country.position,
        label: {
            text: country.name,
            font: '24px Helvetica',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -50),
            scaleByDistance: new Cesium.NearFarScalar(1.0e6, 1.0, 2.0e7, 0.5),
            translucencyByDistance: new Cesium.NearFarScalar(1.0e6, 1.0, 2.0e7, 0.1)
        },
        point: {
            pixelSize: 10,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
        }
    });
});

// Optional: Add click handlers for country interaction
viewer.cesiumWidget.screenSpaceEventHandler.setInputAction((event) => {
    const picked = viewer.scene.pick(event.position);
    if (picked && picked.id && picked.id.label) {
        // Handle country selection/interaction here
    }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// Set initial camera view
viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(0.0, 0.0, 20000000),
    orientation: {
        heading: 0.0,
        pitch: -Cesium.Math.PI_OVER_TWO,
        roll: 0.0
    }
});

// Enable lighting
viewer.scene.globe.enableLighting = true;

export { viewer };