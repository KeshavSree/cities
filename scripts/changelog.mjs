import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const draftsDir=resolve(root,'changelog/drafts');
const stateFile=resolve(root,'changelog/state.json');
const publishedFile=resolve(root,'src/data/changelog.json');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const read=(path,fallback)=>existsSync(path)?JSON.parse(readFileSync(path,'utf8')):fallback;
const save=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const day=()=>{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Indianapolis',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const value=type=>parts.find(part=>part.type===type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};
const editorialFile=path=>path.startsWith('changelog/')||path==='src/data/changelog.json';
function source(base,head){
  const range=base===head?[]:git('log','--no-merges','--format=%s',`${base}..${head}`).split('\n').filter(Boolean);
  const paths=new Set([
    ...(base===head?[]:git('diff','--name-only',base,head).split('\n')),
    ...git('diff','--name-only','HEAD').split('\n'),
    ...git('ls-files','--others','--exclude-standard').split('\n'),
  ].filter(path=>path&&!editorialFile(path)));
  const tracked=git('diff','HEAD','--','.',':(exclude)changelog',':(exclude)src/data/changelog.json');
  const untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(path=>path&&!editorialFile(path));
  const hash=createHash('sha256').update(head).update(tracked);
  for(const path of untracked.sort())hash.update(path).update(readFileSync(resolve(root,path)));
  return {commits:range,files:[...paths].sort(),hash:hash.digest('hex')};
}
function draft(){
  let head;
  try{head=git('rev-parse','HEAD');}catch{console.log('Changelog draft skipped: Git history is unavailable.');return;}
  mkdirSync(draftsDir,{recursive:true});
  const state=read(stateFile,{baseRevision:head,approvedSources:[]});
  if(!existsSync(stateFile))save(stateFile,state);
  const changes=source(state.baseRevision,head);
  if(!changes.files.length&&!changes.commits.length){console.log('No new changes to draft.');return;}
  if(state.approvedSources.includes(changes.hash)){console.log('These changes already have an approved changelog.');return;}
  const id=`update-${changes.hash.slice(0,12)}`,filename=`${id}.json`,path=resolve(draftsDir,filename);
  if(!existsSync(path)){
    const bullets=[];
    const affected=pattern=>changes.files.some(file=>pattern.test(file));
    if(affected(/Cyberpunk|buildingForm|CityScene|SegmentEditor|TierSlices/))bullets.push('Updates to tower appearance and customization.');
    if(affected(/Onboarding|InviteWelcome/))bullets.push('Updates to the welcome and onboarding experience.');
    if(affected(/invitation|Invitation/))bullets.push('Updates to inviting friends into your city.');
    if(affected(/Changelog|changelog/))bullets.push('A new place to keep up with city updates.');
    if(affected(/GitHub|shared\/github|worker\/index|src\/api/))bullets.push('Updates to account activity and city services.');
    if(affected(/mobile|Profile|Resident|Search/))bullets.push('Improvements to profiles, navigation, and mobile layouts.');
    if(!bullets.length)bullets.push(...changes.commits.map(subject=>subject.replace(/^(feat|fix|chore|refactor)(\([^)]*\))?:\s*/i,'')).slice(0,8));
    if(!bullets.length)bullets.push('Improvements across the city.');
    save(path,{id,date:day(),title:'City updates',summary:'',changes:bullets,source:{baseRevision:state.baseRevision,revision:head,fingerprint:changes.hash,commits:changes.commits,files:changes.files}});
  }
  console.log(`Draft ready: changelog/drafts/${filename}\nReview and edit its title, summary, and changes. Then approve:\n  npm run changelog:approve -- ${filename}`);
}
function approve(filename){
  if(!filename||basename(filename)!==filename||!/^update-[a-f0-9]{12}\.json$/.test(filename))throw new Error('Pass a draft filename, such as update-123456abcdef.json.');
  const entry=read(resolve(draftsDir,filename),null);
  if(!entry)throw new Error('Draft not found.');
  if(entry.id!==filename.slice(0,-5)||!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)||!Number.isFinite(Date.parse(entry.date))||typeof entry.title!=='string'||!entry.title.trim()||typeof entry.summary!=='string'||!Array.isArray(entry.changes)||!entry.changes.length||!entry.changes.every(change=>typeof change==='string'&&change.trim()))throw new Error('Draft needs a valid date, title, summary, and nonempty list of changes.');
  const state=read(stateFile,null);
  if(!state||entry.source?.baseRevision!==state.baseRevision)throw new Error('This draft is older than the last approval. Generate and review a fresh draft.');
  if(!/^[a-f0-9]{40}$/.test(entry.source.revision)||!/^[a-f0-9]{64}$/.test(entry.source.fingerprint))throw new Error('Invalid draft source metadata.');
  if(source(state.baseRevision,git('rev-parse','HEAD')).hash!==entry.source.fingerprint)throw new Error('The code changed after this draft was generated. Generate and review a fresh draft before approving.');
  const published=read(publishedFile,[]);
  if(published.some(update=>update.id===entry.id))throw new Error('This draft was already approved.');
  published.unshift({id:entry.id,date:entry.date,title:entry.title.trim(),summary:entry.summary.trim(),changes:entry.changes.map(change=>change.trim())});
  save(publishedFile,published);
  save(stateFile,{baseRevision:entry.source.revision,approvedSources:[...state.approvedSources,entry.source.fingerprint]});
  console.log(`Approved: ${entry.title}. It is now visible in the local changelog. Deploy the app when you want it live.`);
}
try{
  const [command='draft',argument]=process.argv.slice(2);
  if(command==='draft')draft();else if(command==='approve')approve(argument);else throw new Error('Use draft or approve <draft filename>.');
}catch(error){console.error(error.message);process.exitCode=1;}
