/**
 * Listener code shown next to each demo. It mirrors exactly what EventStage.jsx
 * registers with addEventListener (written out here so it reads as plain JavaScript).
 */
export const DEMOS = {
  button: {
    title: 'Button',
    events: ['click', 'dblclick'],
    code: `const button = document.querySelector('#ev-button');
const label = document.querySelector('#ev-count');
let count = 0;

button.addEventListener('click', function handleClick(event) {
  count = count + 1;
  updateCounter(count);
});

button.addEventListener('dblclick', function handleDoubleClick(event) {
  celebrate(button);
});

function updateCounter(value) {
  label.textContent = 'Clicked ' + value + ' time(s)';
  return label.textContent;
}

function celebrate(element) {
  return element.classList.toggle('party');
}`,
  },
  hover: {
    title: 'Hover card',
    events: ['mouseover', 'mouseout'],
    code: `const card = document.querySelector('#ev-card');
const status = document.querySelector('#ev-card-status');

card.addEventListener('mouseover', function handleOver(event) {
  setHighlight(true);
});

card.addEventListener('mouseout', function handleOut(event) {
  setHighlight(false);
});

function setHighlight(on) {
  card.classList.toggle('hovered', on);
  status.textContent = on ? 'Pointer is over the card' : 'Hover over me';
  return on;
}`,
  },
  input: {
    title: 'Text input',
    events: ['keydown', 'keyup', 'input'],
    code: `const input = document.querySelector('#ev-input');
const keyView = document.querySelector('#ev-key');
const mirror = document.querySelector('#ev-mirror');

input.addEventListener('keydown', function handleKeyDown(event) {
  showKey(event.key, 'down');
});

input.addEventListener('keyup', function handleKeyUp(event) {
  showKey(event.key, 'up');
});

input.addEventListener('input', function handleInput(event) {
  mirrorText(event.target.value);
});

function showKey(key, state) {
  keyView.textContent = key + ' (' + state + ')';
  return keyView.textContent;
}

function mirrorText(value) {
  mirror.textContent = value || '…';
  return value.length;
}`,
  },
  select: {
    title: 'Select',
    events: ['change'],
    code: `const select = document.querySelector('#ev-select');
const swatch = document.querySelector('#ev-swatch');

select.addEventListener('change', function handleChange(event) {
  applyColour(event.target.value);
});

function applyColour(colour) {
  swatch.setAttribute('data-colour', colour);
  swatch.textContent = colour;
  return colour;
}`,
  },
  checkbox: {
    title: 'Checkbox',
    events: ['change'],
    code: `const checkbox = document.querySelector('#ev-terms');
const note = document.querySelector('#ev-terms-note');

checkbox.addEventListener('change', function handleToggle(event) {
  toggleTerms(event.target.checked);
});

function toggleTerms(accepted) {
  note.textContent = accepted ? 'Terms accepted ✓' : 'Terms not accepted';
  note.classList.toggle('ok', accepted);
  return accepted;
}`,
  },
  form: {
    title: 'Form',
    events: ['submit'],
    code: `const form = document.querySelector('#ev-form');
const result = document.querySelector('#ev-form-result');

form.addEventListener('submit', function handleSubmit(event) {
  event.preventDefault();          // stop the page from reloading
  validateName(form.elements.name.value);
});

function validateName(name) {
  const ok = name.trim().length >= 2;
  result.textContent = ok ? 'Hello, ' + name.trim() + '!' : 'Name needs at least 2 characters';
  result.classList.toggle('ok', ok);
  result.classList.toggle('bad', !ok);
  return ok;
}`,
  },
};

export const EVENT_CATEGORIES = {
  pointer: ['click', 'dblclick'],
  hover: ['mouseover', 'mouseout'],
  keyboard: ['keydown', 'keyup'],
  form: ['input', 'change', 'submit'],
};
