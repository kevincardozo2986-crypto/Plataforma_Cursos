import { parseTemplate } from './frontend/node_modules/@angular/compiler/fesm2022/compiler.mjs';
import { englishTeacher } from './frontend/src/app/core/i18n/english-teacher.ts';
import ts from './frontend/node_modules/typescript/lib/typescript.js';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
const dictionarySource = readFileSync('frontend/src/app/core/i18n/english-interface.ts','utf8').replace(/^import .*$/gm,'');
const campusSource = ts.transpileModule(readFileSync('frontend/src/app/core/i18n/english-campus.ts','utf8').replace(/^import .*$/gm,''),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const { englishCampus } = await import('data:text/javascript,'+encodeURIComponent('const englishTeacher='+JSON.stringify(englishTeacher)+';\n'+campusSource));
const compiled = ts.transpileModule(dictionarySource,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const { englishInterface } = await import('data:text/javascript,'+encodeURIComponent('const englishCampus='+JSON.stringify(englishCampus)+';\n'+compiled));
const legacy = readFileSync('frontend/src/app/core/i18n/translations.ts','utf8');
const dictionary = new Set([...Object.keys(englishInterface), ...[...legacy.matchAll(/'([^']+)'\s*:/g)].map(match=>match[1])]);
for (const key of ['Accesibilidad','Contraseña','Idioma','Campus','Virtual']) dictionary.add(key);
const normalize = text => text.replace(/\s+/g,' ').trim();
const literal = text => "'"+text.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n')+"'";
const fields = /^(?:link\.label|roleLabel\(\)|filter\.label|step\.label|tab\.label|item\.label|option\.label|course\(\)\.duration|course\(\)\.level|card\.title|card\.category|model\.field|model\.course|levelLabels\[[\s\S]+\]|pokLabels\[[\s\S]+\]|labels\[[\s\S]+\])$/;
function migrate(source, file) {
  const tree = parseTemplate(source,file,{preserveWhitespaces:true});
  if(tree.errors?.length) throw new Error(file+': '+tree.errors.map(e=>e.toString()).join('\n'));
  const edits = [];
  function visit(nodes,inSvg=false){
    for(const node of nodes??[]){
      const svg=inSvg||node.name==='svg';
      if(!svg&&node.constructor.name==='Text'){
        const key=normalize(node.value);
        if(dictionary.has(key)&&key.length>1){
          const start=node.sourceSpan.start.offset,end=node.sourceSpan.end.offset;
          const raw=source.slice(start,end);
          edits.push({start,end,text:(raw.match(/^\s*/)?.[0]??'')+'{{ '+literal(key)+' | t }}'+(raw.match(/\s*$/)?.[0]??'')});
        }
      }
      if(!svg&&node.constructor.name==='BoundText'){
        const start=node.sourceSpan.start.offset,end=node.sourceSpan.end.offset;
        const raw=source.slice(start,end);let index=0;
        const updated=raw.split(/(\{\{[\s\S]*?\}\})/).map(part=>{
          if(part.startsWith('{{'))return part;
          const key=normalize(node.value.ast.strings[index++]??part);
          if(!dictionary.has(key)||key.length<2)return part;
          return (part.match(/^\s*/)?.[0]??'')+'{{ '+literal(key)+' | t }}'+(part.match(/\s*$/)?.[0]??'');
        }).join('');
        if(updated!==raw)edits.push({start,end,text:updated});
      }
      for(const attr of node.attributes??[]){
        const key=normalize(attr.value);
        if(['placeholder','aria-label','title','alt','subtitle','label','hint'].includes(attr.name)&&dictionary.has(key)) {
          const name=attr.name==='aria-label'?'attr.aria-label':attr.name;
          edits.push({start:attr.sourceSpan.start.offset,end:attr.sourceSpan.end.offset,text:`[${name}]="${literal(key).replace(/"/g,'&quot;')} | t"`});
        }
      }
      visit(node.children,svg);visit(node.branches,svg);visit(node.cases,svg);
      if(node.empty)visit([node.empty],svg);
    }
  }
  visit(tree.nodes);
  let result=source;
  for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);
  result=result.replace(/\{\{([\s\S]*?)\}\}/g,(full,expression)=>{
    if(/\|\s*t(?:\s|\)|\}|$)/.test(expression))return full;
    if(fields.test(expression.trim()))return '{{ ('+expression.trim()+') | t }}';
    const updated=expression.replace(/'((?:[^'\\]|\\.)*)'/g,(value,text)=>dictionary.has(text)?'('+value+' | t)':value);
    return '{{'+updated+'}}';
  });
  // Translate literals in bound, user-facing attributes without touching routes or data bindings.
  result=result.replace(/(\[(?:placeholder|attr\.aria-label|title|alt|subtitle|label|hint)\]="ٌ?)([^"]+)(")/g,(full,start,expression,end)=>{
    if(/\|\s*t(?:\s|\)|$)/.test(expression))return full;
    const updated=expression.replace(/'((?:[^'\\]|\\.)*)'/g,(value,text)=>dictionary.has(text)?'('+value+' | t)':value);
    return start+updated+end;
  });
  return result;
}
function addImport(source,file){
  if(source.includes('import { TranslatePipe }'))return source;
  let path=relative(dirname(file),'frontend/src/app/core/i18n/translate.pipe').replace(/\\/g,'/');if(!path.startsWith('.'))path='./'+path;
  source=`import { TranslatePipe } from '${path}';\n`+source;
  const start=source.indexOf('@Component({');if(start<0)throw Error('No component: '+file);
  const match=/imports:\s*\[/.exec(source.slice(start));
  if(match){const index=start+match.index+match[0].length;return source.slice(0,index)+'TranslatePipe, '+source.slice(index);}
  return source.replace('@Component({','@Component({\n  imports: [TranslatePipe],');
}
const modified=[];
function walk(folder){for(const item of readdirSync(folder,{withFileTypes:true})){
  const file=join(folder,item.name);if(item.isDirectory()){walk(file);continue;}
  if(!file.endsWith('.html'))continue;
  const source=readFileSync(file,'utf8'),updated=migrate(source,file);if(updated===source)continue;
  const ts=file.replace(/\.html$/,'.ts');const component=readFileSync(ts,'utf8');
  writeFileSync(file,updated);writeFileSync(ts,addImport(component,ts));modified.push(file,ts);
}}
walk('frontend/src/app');
function inline(folder){for(const item of readdirSync(folder,{withFileTypes:true})){
  const file=join(folder,item.name);if(item.isDirectory()){inline(file);continue;}
  if(!file.endsWith('.ts')||file.endsWith('.spec.ts'))continue;
  const source=readFileSync(file,'utf8');let changed=false;
  let updated=source.replace(/(template:\s*`)([\s\S]*?)(`)/g,(full,start,html,end)=>{const result=migrate(html,file);if(result!==html)changed=true;return start+result+end;});
  if(changed){updated=addImport(updated,file);writeFileSync(file,updated);modified.push(file);}
}}
inline('frontend/src/app');
writeFileSync('.i18n-modified.json',JSON.stringify([...new Set(modified)],null,2));
console.log('Updated files: '+new Set(modified).size);
