import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
export type Environment=Record<string,string|undefined>;
export class ConfigError extends Error {constructor(public fields:string[]){super('CONFIG_INVALID:'+fields.join(','));}}
/** No connections, listeners, process mutation, or secret values in diagnostic output. */
export function loadConfig(env:Environment, codeRoot=process.cwd()) {
 const errors:string[]=[];const strict=['production','staging'].includes(env.NODE_ENV??'');
 const originList=(raw:string|undefined)=>[...new Set((raw??'').split(',').map(s=>s.trim()).filter(Boolean))].sort();
 const primary=originList(env.ALLOWED_ORIGINS),legacy=originList(env.CORS_ORIGINS);
 if(primary.length&&legacy.length&&JSON.stringify(primary)!==JSON.stringify(legacy))errors.push('CORS_ALIAS_CONFLICT');
 const origins=primary.length?primary:legacy.length?legacy:strict?[]:['http://localhost:5173'];
 if(strict&&!origins.length)errors.push('ALLOWED_ORIGINS');
 for(const origin of origins){try{const u=new URL(origin);if(!['http:','https:'].includes(u.protocol)||u.origin!==origin||u.username||u.password)errors.push('CORS_ORIGIN_INVALID');}catch{errors.push('CORS_ORIGIN_INVALID');}}
 if(env.NODE_ENV&&!['development','test','staging','production'].includes(env.NODE_ENV))errors.push('NODE_ENV');
 for(const name of ['DATABASE_URL','DIRECT_URL'])if(strict||env[name]){try{const u=new URL(env[name]??'');if(!['postgresql:','postgres:'].includes(u.protocol)||!u.hostname||u.pathname.length<2)errors.push(name);}catch{errors.push(name);}}
 if(strict){if(!env.JWT_SECRET||env.JWT_SECRET.length<32||/please-change|admin123|123456|rdpms-jwt-secret/i.test(env.JWT_SECRET))errors.push('JWT_SECRET');
  if(['1','true'].includes(env.SEED_TEST_ACCOUNTS??'')||['1','true'].includes(env.SEED_DEMO??''))errors.push('SEED_TEST_ACCOUNTS');}
 const port=Number(env.PORT??3000),hostname=env.HOST??'127.0.0.1';
 if(!Number.isInteger(port)||port<1||port>65535)errors.push('PORT');
 if(strict&&!['127.0.0.1','::1','localhost'].includes(hostname))errors.push('HOST');
 const uploadRoot=path.resolve(env.UPLOAD_DIR??path.join(codeRoot,'uploads'));
 if(strict&&(!env.UPLOAD_DIR||!path.isAbsolute(env.UPLOAD_DIR)||uploadRoot===path.resolve(codeRoot)||uploadRoot.startsWith(path.resolve(codeRoot)+path.sep)))errors.push('UPLOAD_DIR');
 if(env.STORAGE_DRIVER&&env.STORAGE_DRIVER!=='local')errors.push('STORAGE_DRIVER_UNSUPPORTED');
 if(env.ENABLE_BACKUP_EXPORT&&env.ENABLE_BACKUP_EXPORT!=='false')errors.push('ENABLE_BACKUP_EXPORT_UNSUPPORTED');
 if(env.TRUST_PROXY_HOPS&&env.TRUST_PROXY_HOPS!=='1')errors.push('TRUST_PROXY_HOPS_UNSUPPORTED');
 if(env.VITE_AUTH_MODE&&env.VITE_AUTH_MODE!=='bearer')errors.push('VITE_AUTH_MODE_UNSUPPORTED');
 if(errors.length)throw new ConfigError([...new Set(errors)]);
 const effective={mode:env.NODE_ENV??'development',origins,credentials:false as const,authTransport:'BEARER_ACCESS_JSON_REFRESH',port,hostname,uploadRoot,storageDriver:'local',exportPolicy:'EXISTING_AUDITED_SUPER_ADMIN_NOT_ENV_TOGGLE',proxyPolicy:'NO_NEW_PROXY_TRUST_IMPLEMENTED'};
 return {...effective,fingerprint:crypto.createHash('sha256').update(JSON.stringify(effective)).digest('hex')};
}
/** Restricted literal EnvironmentFile subset, no eval/source/substitution or duplicate aliases. */
export function readEnvironmentFile(file:string):Environment {
 const result:Environment={};
 for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
  if(!line.trim()||line.trim().startsWith('#'))continue;
  const match=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());if(!match||Object.hasOwn(result,match[1]))throw new ConfigError(['ENV_FILE_SYNTAX_OR_DUPLICATE']);
  let value=match[2];if(value.startsWith('"')&&value.endsWith('"')||value.startsWith("'")&&value.endsWith("'"))value=value.slice(1,-1);
  if(/[\u0000\r\n]/.test(value))throw new ConfigError(['ENV_FILE_VALUE']);result[match[1]]=value;
 }
 return result;
}
