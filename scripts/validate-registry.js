import { readFileSync } from 'node:fs';
const registry = JSON.parse(readFileSync('modules/e2e/projects.json', 'utf8'));
if (!Array.isArray(registry.projects)) throw new Error('projects.json needs { projects: [] }');
const ids = new Set();
for (const project of registry.projects) {
  for (const key of ['id', 'name', 'href', 'surfaces']) if (!(key in project)) throw new Error(`project missing ${key}`);
  if (ids.has(project.id)) throw new Error(`duplicate project id ${project.id}`);
  ids.add(project.id);
  if (!Array.isArray(project.surfaces)) throw new Error(`${project.id}.surfaces must be array`);
  for (const surface of project.surfaces) {
    for (const key of ['id', 'name', 'href']) if (!(key in surface)) throw new Error(`${project.id} surface missing ${key}`);
  }
}
console.log(`Validated ${registry.projects.length} E2E projects.`);
