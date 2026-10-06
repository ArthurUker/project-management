import {loadConfig,readEnvironmentFile,ConfigError} from './configSchema.js';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export function checkConfiguration(args:string[]){
 const index=args.indexOf('--env-file');const env=index<0?process.env:readEnvironmentFile(args[index+1]);
 const root=args.indexOf('--code-root');const config=loadConfig(env,root<0?process.cwd():args[root+1]);
 const manifest=args.indexOf('--compare-manifest');
 if(manifest>=0 && JSON.parse(fs.readFileSync(args[manifest+1],'utf8')).effectiveConfig.fingerprint!==config.fingerprint)throw new ConfigError(['PREPARED_RUNTIME_CONFIG_MISMATCH']);
 // Only non-secret effective projection; never URLs, passwords, token, or raw dotenv.
 console.log(JSON.stringify({valid:true,fingerprint:config.fingerprint,origins:config.origins,credentials:config.credentials,authTransport:config.authTransport,mode:config.mode,exportPolicy:config.exportPolicy,proxyPolicy:config.proxyPolicy}));
 return config;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(fs.realpathSync(process.argv[1])).href){try{checkConfiguration(process.argv.slice(2));}catch(error){console.error(JSON.stringify({valid:false,fields:error instanceof ConfigError?error.fields:['CONFIG_READ_FAILED']}));process.exitCode=1;}}
