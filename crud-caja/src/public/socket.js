(function bootstrapRestoSocketSingleton(globalScope) {
  const browserProtocol = globalScope.location?.protocol || 'http:';
  const browserHost = globalScope.location?.hostname || '127.0.0.1';
  const fallbackSocketUrl = `${browserProtocol}//${browserHost}:5000`;
  const socketUrl = globalScope.RESTO_CONFIG?.SOCKET_URL || fallbackSocketUrl;
  let socketSingleton = null;
  let socketClientLoader = null;

  function ensureSocketIoClient() {
    if (globalScope.io) {
      return Promise.resolve(globalScope.io);
    }

    if (socketClientLoader) {
      return socketClientLoader;
    }

    socketClientLoader = new Promise((resolve, reject) => {
      const script = globalScope.document.createElement('script');
      script.src = `${socketUrl}/socket.io/socket.io.js`;
      script.async = true;
      script.onload = () => resolve(globalScope.io);
      script.onerror = reject;
      globalScope.document.head.appendChild(script);
    });

    return socketClientLoader;
  }

  globalScope.getRestoSocket = async function getRestoSocket() {
    if (socketSingleton) {
      return socketSingleton;
    }

    const ioClient = await ensureSocketIoClient();
    socketSingleton = ioClient(socketUrl, {
      transports: ['websocket'],
      autoConnect: true,
    });

    return socketSingleton;
  };
})(window);