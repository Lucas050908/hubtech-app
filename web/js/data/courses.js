/** All courses the course player can show. The start course loads at once; the machine courses load when needed. */
import { COURSE as START } from './course-servicetekniker.js';

export const START_COURSE = { ...START, unit: START.unit || 'Dag' };

let makers = null, apps = null;
export const loadMakerCourses = () => (makers ||= import('./makercourses.js'));
export const loadAppCourses = () => (apps ||= import('./appcourses.js'));
/** Every course except the start course, with the groups they are shown in. */
export async function loadAllCourses() {
  const [{ MAKER_COURSES, MAKER_GROUPS }, { APP_COURSES, APP_GROUPS }] = await Promise.all([loadMakerCourses(), loadAppCourses()]);
  return { courses: [...APP_COURSES, ...MAKER_COURSES], groups: [...APP_GROUPS, ...MAKER_GROUPS] };
}
/** A lesson's "Lær" points as plain text (for search). */
export const pointsText = (l) => (l || []).map(x => (typeof x === 'string' ? x : x?.code || '')).join(' ');

export async function findCourse(id) {
  if (id === START_COURSE.id) return START_COURSE;
  const { courses } = await loadAllCourses();
  return courses.find(c => c.id === id) || null;
}
