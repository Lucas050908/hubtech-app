/** All courses the course player can show. The start course loads at once; the machine courses load when needed. */
import { COURSE as START } from './course-servicetekniker.js';

export const START_COURSE = { ...START, unit: START.unit || 'Dag' };

let makers = null;
export const loadMakerCourses = () => (makers ||= import('./makercourses.js'));

export async function findCourse(id) {
  if (id === START_COURSE.id) return START_COURSE;
  const { MAKER_COURSES } = await loadMakerCourses();
  return MAKER_COURSES.find(c => c.id === id) || null;
}
