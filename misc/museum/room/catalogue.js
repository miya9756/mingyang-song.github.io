// The catalogue can open a print even if the room's graphics backend is unavailable.
const entries = Array.from(document.querySelectorAll('[data-work]'));
const viewer = document.getElementById('print-view');
const image = document.getElementById('print-image');
const count = document.getElementById('print-count');
const title = document.getElementById('print-title');
const medium = document.getElementById('print-medium');
let current = 0;

function displayPrint(index) {
  current = (index + entries.length) % entries.length;
  const entry = entries[current];
  image.src = entry.href;
  image.alt = entry.querySelector('img').alt;
  title.textContent = entry.querySelector('span').textContent;
  medium.textContent = 'Mingyang Song · ' + (entry.dataset.med || 'photograph, repainted');
  count.textContent = 'Painting ' + (current + 1) + ' of ' + entries.length;
}

entries.forEach((entry, index) => {
  entry.addEventListener('click', event => {
    if (!viewer.showModal || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    displayPrint(index);
    viewer.showModal();
  });
});
document.getElementById('close-print').addEventListener('click', () => viewer.close());
document.getElementById('prev-print').addEventListener('click', () => displayPrint(current - 1));
document.getElementById('next-print').addEventListener('click', () => displayPrint(current + 1));
viewer.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    displayPrint(current + (event.key === 'ArrowLeft' ? -1 : 1));
  }
});
