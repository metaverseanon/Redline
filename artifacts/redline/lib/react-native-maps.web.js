const React = require('react');
const { View } = require('react-native');

const Stub = (props) => React.createElement(View, props, props.children);

module.exports = {
  __esModule: true,
  default: Stub,
  PROVIDER_DEFAULT: undefined,
  PROVIDER_GOOGLE: undefined,
  Polyline: Stub,
  Marker: Stub,
  Polygon: Stub,
  Circle: Stub,
  Callout: Stub,
  Overlay: Stub,
  Heatmap: Stub,
};
