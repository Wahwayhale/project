module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Disable ModuleConcatenationPlugin (scope hoisting) to prevent
      // "Cannot access before initialization" (TDZ) errors in production.
      // This is a known issue when webpack concatenates many ES modules
      // with cross-references into a single scope.
      if (webpackConfig.optimization) {
        webpackConfig.optimization.concatenateModules = false;
      }
      return webpackConfig;
    },
  },
};
