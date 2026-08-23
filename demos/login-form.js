const loginForm = document.querySelector('#login-demo');

loginForm?.addEventListener('submit', event => {
  event.preventDefault();
  event.currentTarget.reset();
  event.currentTarget.querySelector('.message').textContent = '介面測試完成！資料沒有送出。';
});
