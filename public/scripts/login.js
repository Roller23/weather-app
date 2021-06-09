(async () => {
  console.log('Hello')
  $('#login').on('click', e => {
    const login = $('#nick-form').val().trim();
    const password = $('#password-form').val().trim();
    if (!login || !password) {
      return alert('Fill out all forms!');
    }
    $.post('/login', {login, password}, res => {
      console.log(res);
      if (res.success) {
        return window.location.reload();
      }
      alert(res.msg);
    });
  });

  $('#register').on('click', e => {
    const login = $('#nick-form-register').val().trim();
    const password = $('#password-form-register').val().trim();
    const password2 = $('#password-form-register2').val().trim();
    if (!login || !password || !password2) {
      return alert('Fill out all forms!');
    }
    if (password !== password2) {
      return alert('Passowrds must match');
    }
    $.post('/register', {login, password}, res => {
      console.log(res);
      if (res.success) {
        return window.location.reload();
      }
      alert(res.msg);
    })
  });
})();