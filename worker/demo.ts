import type { Color, Style } from '../shared/types';
import { xpAtLevel } from '../shared/progression';
const people = [
  ['demo-you', 'alexpark', 'Alex Park', 'Building useful little things. Usually with TypeScript.', 0, 0, 4, 'terrace', 'sand', 186, 24, 18],
  ['demo-maya', 'mayachen', 'Maya Chen', 'Frontend engineer. Collector of tiny side projects.', 1, 0, 21, 'modern', 'lilac', 412, 38, 27],
  ['demo-jules', 'julesrivera', 'Jules Rivera', 'Making the web a more playful place.', -1, 0, 4, 'terrace', 'coral', 132, 19, 9],
  ['demo-sam', 'samokafor', 'Sam Okafor', 'Systems, open source, and very good coffee.', 0, 1, 30, 'spire', 'blue', 628, 71, 42],
  ['demo-nora', 'norali', 'Nora Li', 'Learning by making. Currently exploring creative coding.', 0, -1, 3, 'modern', 'sage', 94, 12, 6],
  ['demo-eli', 'elithomas', 'Eli Thomas', 'Open source tools for curious people.', 1, 1, 6, 'terrace', 'sage', 244, 31, 22],
  ['demo-asha', 'ashapatel', 'Asha Patel', 'Backend engineer with a soft spot for game design.', -1, 1, 18, 'modern', 'sand', 328, 42, 31],
  ['demo-leo', 'leomartin', 'Leo Martin', 'Graphics, shaders, and the occasional happy accident.', 1, -1, 24, 'spire', 'coral', 520, 46, 28],
  ['demo-zoe', 'zoekim', 'Zoe Kim', 'Design engineer. Details make the difference.', -1, -1, 5, 'terrace', 'lilac', 174, 22, 17],
  ['demo-ben', 'benwilliams', 'Ben Williams', 'Turning ideas into things you can click.', 2, 0, 4, 'modern', 'blue', 122, 18, 8],
  ['demo-ida', 'idahassan', 'Ida Hassan', 'Small experiments in machine learning.', -2, 0, 27, 'spire', 'sand', 284, 34, 21],
  ['demo-omar', 'omarali', 'Omar Ali', 'Building for the next billion people.', 0, 2, 8, 'terrace', 'coral', 402, 41, 33],
  ['demo-theo', 'theodavis', 'Theo Davis', 'Infrastructure should feel invisible.', 0, -2, 15, 'modern', 'blue', 357, 39, 29],
  ['demo-ruby', 'rubyng', 'Ruby Ng', 'New to open source. Happy to be here.', 2, 1, 1, 'terrace', 'lilac', 46, 8, 3],
  ['demo-finn', 'finnclark', 'Finn Clark', 'The intersection of music and code.', -2, 1, 3, 'spire', 'sage', 84, 14, 8],
  ['demo-iris', 'iriswang', 'Iris Wang', 'Building accessible interfaces for everyone.', 2, -1, 6, 'modern', 'coral', 247, 32, 26],
  ['demo-noah', 'noahsingh', 'Noah Singh', 'Databases, distributed systems, and dumplings.', -2, -1, 12, 'modern', 'lilac', 389, 51, 35],
  ['demo-lena', 'lenagarcia', 'Lena Garcia', 'One good idea at a time.', 1, 2, 4, 'terrace', 'blue', 146, 21, 10],
  ['demo-ari', 'aribrown', 'Ari Brown', 'Thinking in pixels and polygons.', -1, 2, 5, 'spire', 'sand', 193, 28, 18],
  ['demo-ava', 'avawilson', 'Ava Wilson', 'Learning Rust. Growing slowly.', 1, -2, 2, 'terrace', 'sage', 52, 6, 4],
  ['demo-kai', 'kaimori', 'Kai Mori', 'Tools that help other people make things.', -1, -2, 7, 'spire', 'coral', 331, 37, 30],
] as const;

// Sample invitation tree: every resident except the founder has an inviter.
// These are demo fixtures, never inferred relationships between real accounts.
const demoConnections:Record<string,string>={
  'demo-maya':'demo-you','demo-jules':'demo-you','demo-sam':'demo-you',
  'demo-nora':'demo-you','demo-asha':'demo-you','demo-leo':'demo-you','demo-zoe':'demo-you',
  'demo-eli':'demo-maya','demo-ben':'demo-maya','demo-ruby':'demo-maya',
  'demo-ida':'demo-jules','demo-finn':'demo-jules',
  'demo-omar':'demo-sam','demo-lena':'demo-sam','demo-ari':'demo-asha',
  'demo-theo':'demo-nora','demo-ava':'demo-nora','demo-kai':'demo-nora',
  'demo-iris':'demo-leo','demo-noah':'demo-zoe',
};

/** Backfill older local demos once; preserve all existing invitation history. */
export async function ensureDemoConnections(db:D1Database){
  const children=Object.keys(demoConnections);
  const missing=await db.prepare(`SELECT u.id FROM users u
    WHERE u.is_demo=1 AND u.id IN (${children.map(()=>'?').join(',')})
    AND NOT EXISTS(SELECT 1 FROM invitations i WHERE i.used_by=u.id)`)
    .bind(...children).all<{id:string}>();
  if(!missing.results.length)return;
  await db.batch(missing.results.map(({id})=>db.prepare(`INSERT OR IGNORE INTO invitations(token,inviter_id,used_by,created_at)
    SELECT ?,parent.id,child.id,'2000-01-01 00:00:00' FROM users parent JOIN users child ON child.id=?
    WHERE parent.id=? AND parent.is_demo=1 AND child.is_demo=1
    AND NOT EXISTS(SELECT 1 FROM invitations i WHERE i.used_by=child.id)`)
    .bind(`demo-seed-${id}`,id,demoConnections[id])));
}

export async function seedDemo(db: D1Database) {
  const stmts: D1PreparedStatement[] = [];
  for (const [id, username, name, bio, x, z, level, style, color, commits, prs, reviews] of people) {
    stmts.push(db.prepare('INSERT OR IGNORE INTO users(id, username, name, bio, is_demo) VALUES(?, ?, ?, ?, 1)').bind(id, username, name, bio));
    stmts.push(db.prepare('INSERT OR IGNORE INTO buildings(user_id, x, z, level, xp, bricks, style, color) VALUES(?, ?, ?, ?, ?, ?, ?, ?)').bind(id, x, z, level, xpAtLevel(level), id === 'demo-you' ? 360 : 120, style as Style, color as Color));
    stmts.push(db.prepare("INSERT OR IGNORE INTO metrics(user_id, commits, prs, reviews, credited_commits, credited_prs, credited_reviews, synced_at) VALUES(?, ?, ?, ?, ?, ?, ?, datetime('now'))").bind(id, commits, prs, reviews, commits, prs, reviews));
  }
  // Seed in three requests via /api/dev/start?batch=N. Each invocation stays below 50 queries.
  return stmts;
}
