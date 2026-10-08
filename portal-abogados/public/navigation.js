// Progressive enhancement: native details menus work without React (also in news SSR).
document.addEventListener('click', function (event) {
  document.querySelectorAll('[data-navigation-menu][open]').forEach(function (menu) {
    if (!menu.contains(event.target) || event.target.closest('a')) menu.open = false;
  });
});
document.addEventListener('keydown', function (event) {
  if (event.key !== 'Escape') return;
  document.querySelectorAll('[data-navigation-menu][open]').forEach(function (menu) {
    menu.open = false;
    menu.querySelector('summary').focus();
  });
});
