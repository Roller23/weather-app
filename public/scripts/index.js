(async () => {
  console.log('Hello')
  const socket = io();

  socket.on('connected', () => {
    console.log('Connected!')
  });

  fetch('/token').then(response => response.json()).then(json => {
    if (!json.success) {
      return alert(json.msg);
    }
    socket.emit('auth', json.token);
  }).catch(err => console.error(err));

})();