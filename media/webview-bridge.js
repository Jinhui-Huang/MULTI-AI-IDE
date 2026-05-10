(function () {
  window.addEventListener('message', function (event) {
    if (window.AutoGenWebviewApp) {
      window.AutoGenWebviewApp.handleExtensionMessage(event);
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    if (window.AutoGenWebviewApp) {
      window.AutoGenWebviewApp.initialize();
    }
  });
})();
