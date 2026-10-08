const byId = (id) => document.getElementById(id);
const storageKey = 'stride-week-v1';
let current = null;
let selected = 0;
let completed = [];
let planProfile = null;
let busy = false;
const icons = () => globalThis.lucide?.createIcons();

function notice(message, error = false) {
  const element = byId('notice');
  element.textContent = message;
  element.classList.toggle('error', error);
  element.hidden = !message;
}

function profile() {
  return {goal: byId('goal').value, level: byId('level').value, equipment: byId('equipment').value,
    days: Number(byId('days').value), minutes: Number(byId('minutes').value),
    adult: byId('adult').checked, clearance_needed: byId('clearance').checked, consent: byId('consent').checked};
}

function save() {
  try {
    if (byId('remember').checked && current) {
      const {adult, clearance_needed, consent, ...preferences} = planProfile;
      localStorage.setItem(storageKey, JSON.stringify({current, completed, preferences}));
    } else localStorage.removeItem(storageKey);
  } catch {
    byId('remember').checked = false;
    notice('Browser storage is unavailable. Your plan remains available in this tab.', true);
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name) {
  const node = document.createElement('i');
  node.dataset.lucide = name;
  return node;
}

function renderDay() {
  const day = current.plan.days[selected];
  byId('day-type').textContent = `${day.day.toUpperCase()} / ${day.kind.toUpperCase()}`;
  byId('day-title').textContent = day.title;
  byId('day-duration').textContent = `${day.minutes} min${day.kind === 'Recovery' ? ' optional' : ''}`;
  byId('day-detail').setAttribute('aria-labelledby', `day-${selected}`);
  const exercises = byId('exercises');
  exercises.replaceChildren();
  day.exercises.forEach((exercise, index) => {
    const row = element('div', 'exercise');
    const content = element('div', 'exercise-content');
    content.append(element('h4', '', exercise.name), element('p', 'dose', exercise.dose), element('p', '', exercise.cue));
    row.append(element('span', 'exercise-number', String(index + 1).padStart(2, '0')), content);
    exercises.append(row);
  });
  byId('complete-day').checked = completed.includes(selected);
  byId('complete-label').textContent = day.kind === 'Recovery' ? 'Mark recovery day complete' : 'Mark session complete';
  document.querySelectorAll('.day-tab').forEach((tab, index) => {
    tab.setAttribute('aria-selected', String(index === selected));
    tab.tabIndex = index === selected ? 0 : -1;
  });
  icons();
}

function render() {
  byId('empty-state').hidden = true;
  byId('plan-content').hidden = false;
  byId('download').disabled = false;
  byId('source-badge').textContent = current.source === 'ai' ? 'AI PERSONALIZED' : 'STARTER PLAN';
  byId('plan-title').textContent = current.plan.title;
  byId('plan-summary').textContent = current.plan.summary;
  const workouts = current.plan.days.filter(day => day.kind === 'Workout');
  const done = completed.filter(index => current.plan.days[index]?.kind === 'Workout').length;
  byId('session-count').replaceChildren(document.createTextNode(String(workouts.length).padStart(2, '0') + ' '), element('small', '', '/ week'));
  byId('time-count').replaceChildren(document.createTextNode(String(planProfile.minutes) + ' '), element('small', '', 'min'));
  byId('complete-count').replaceChildren(document.createTextNode(`${done} `), element('small', '', `/ ${workouts.length}`));
  byId('week-progress').max = workouts.length;
  byId('week-progress').value = done;
  const week = byId('week');
  week.replaceChildren();
  current.plan.days.forEach((day, index) => {
    const tab = element('button', `day-tab${completed.includes(index) ? ' done' : ''}`);
    tab.id = `day-${index}`;
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', 'day-detail');
    tab.setAttribute('aria-label', `${day.day}, ${day.kind}${completed.includes(index) ? ', completed' : ''}`);
    tab.append(element('span', '', day.day.slice(0, 3)), icon(completed.includes(index) ? 'circle-check' : day.kind === 'Workout' ? 'dumbbell' : 'leaf'), element('small', '', day.kind === 'Workout' ? `${day.minutes} min` : 'Rest'));
    tab.addEventListener('click', () => { selected = index; renderDay(); });
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      selected = event.key === 'Home' ? 0 : event.key === 'End' ? 6 : (index + (event.key === 'ArrowRight' ? 1 : 6)) % 7;
      renderDay();
      byId(`day-${selected}`).focus();
    });
    week.append(tab);
  });
  byId('habits').replaceChildren(...current.plan.habits.map(habit => element('li', '', habit)));
  renderDay();
}

function confirmAction(title, message) {
  byId('dialog-title').textContent = title;
  byId('dialog-message').textContent = message;
  const dialog = byId('confirm-dialog');
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), {once: true}));
}

async function generate(useAi) {
  if (busy || !byId('profile-form').reportValidity()) return;
  const preferences = profile();
  if (preferences.clearance_needed) {
    notice('Please consult a qualified clinician before starting a plan for an injury, pregnancy, symptoms, or a condition affecting exercise.', true);
    byId('notice').scrollIntoView({block: 'center'});
    return;
  }
  if (useAi && !preferences.consent) {
    notice('Please agree to share your fitness preferences with the AI provider, or choose a starter plan.', true);
    byId('consent').focus();
    return;
  }
  if (current && !(await confirmAction('Replace your week?', 'Your current plan and completion marks will be replaced.'))) return;
  busy = true;
  byId('generate').disabled = true;
  byId('starter').disabled = true;
  byId('clear-data').disabled = true;
  byId('plan-content').setAttribute('aria-busy', 'true');
  notice(useAi ? 'Preparing your week. This can take up to 40 seconds...' : 'Preparing your starter week...');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch('/api/plan', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({profile: preferences, use_ai: useAi}), signal: controller.signal});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The plan could not be created. Please try again.');
    current = data;
    planProfile = preferences;
    completed = [];
    selected = 0;
    render();
    notice(data.message);
    save();
    byId('source-badge').scrollIntoView({block: 'center', behavior: 'smooth'});
  } catch (error) {
    notice(error.name === 'AbortError' ? 'The request timed out. Please try a starter plan or retry shortly.' : error.message === 'Failed to fetch' ? 'Cannot reach the app. Check that the Python server is running.' : error.message, true);
  } finally {
    clearTimeout(timer);
    busy = false;
    byId('generate').disabled = false;
    byId('starter').disabled = false;
    byId('clear-data').disabled = false;
    byId('plan-content').setAttribute('aria-busy', 'false');
  }
}

byId('profile-form').addEventListener('submit', event => { event.preventDefault(); generate(true); });
byId('starter').addEventListener('click', () => generate(false));
byId('days').addEventListener('input', () => { byId('days-value').textContent = `${byId('days').value} days`; });
byId('complete-day').addEventListener('change', () => {
  completed = byId('complete-day').checked ? [...new Set([...completed, selected])] : completed.filter(index => index !== selected);
  render();
  save();
});
byId('remember').addEventListener('change', save);
byId('cancel-dialog').addEventListener('click', () => byId('confirm-dialog').close('no'));
byId('accept-dialog').addEventListener('click', () => byId('confirm-dialog').close('yes'));
byId('clear-data').addEventListener('click', async () => {
  if (!(await confirmAction('Delete your data?', 'This removes your saved plan and progress from this browser and resets the current tab.'))) return;
  try { localStorage.removeItem(storageKey); location.reload(); }
  catch { notice('Browser storage could not be accessed. Clear this site in your browser settings.', true); }
});
byId('download').addEventListener('click', () => {
  if (!current) return;
  const lines = ['STRIDE | WEEKLY FITNESS PLAN', current.source === 'ai' ? 'AI-generated plan' : 'Starter plan (not AI-generated)', '', current.plan.title, current.plan.summary, ''];
  current.plan.days.forEach((day, index) => {
    lines.push(`${day.day}: ${day.title} | ${day.minutes} min | ${day.kind}${completed.includes(index) ? ' | Completed' : ''}`);
    day.exercises.forEach(exercise => lines.push(`  ${exercise.name} - ${exercise.dose}`, `  ${exercise.cue}`));
    lines.push('');
  });
  lines.push('DAILY HABITS', ...current.plan.habits.map(habit => `- ${habit}`), '', 'General fitness guidance, not medical advice. Stop for pain, dizziness, or unusual breathlessness. Seek urgent care for chest pain or fainting. Consult a clinician for health concerns.');
  const url = URL.createObjectURL(new Blob([lines.join('\n')], {type: 'text/plain;charset=utf-8'}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'stride-week.txt';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved) {
    if (!Array.isArray(saved.current?.plan?.days) || saved.current.plan.days.length !== 7 || !Array.isArray(saved.completed) || !saved.preferences) throw new Error('Invalid saved plan');
    current = saved.current;
    completed = [...new Set(saved.completed.filter(index => Number.isInteger(index) && index >= 0 && index < 7))];
    planProfile = saved.preferences;
    for (const key of ['goal', 'level', 'equipment', 'days', 'minutes']) byId(key).value = saved.preferences[key];
    byId('days-value').textContent = `${byId('days').value} days`;
    byId('remember').checked = true;
    render();
    notice('Your saved week is ready.');
  }
} catch {
  current = null;
  completed = [];
  byId('plan-content').hidden = true;
  byId('empty-state').hidden = false;
  byId('download').disabled = true;
  notice('Saved data could not be loaded. Create a new week or delete saved data.', true);
}
icons();