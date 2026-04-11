import React from 'react';
import CustomerLocationPicker from './CustomerLocationPicker';

const ProspectLocationPicker = ({
  latitude,
  longitude,
  onLocationChange,
  onAddressChange,
  editMode = true,
  prospectName = '',
  country = '',
  height = 360,
}) => (
  <CustomerLocationPicker
    latitude={latitude}
    longitude={longitude}
    onLocationChange={onLocationChange}
    onAddressChange={onAddressChange}
    editMode={editMode}
    customerName={prospectName}
    country={country}
    height={height}
  />
);

export default ProspectLocationPicker;
