import {spawn} from 'node:child_process';
import {readEnvironmentFile,loadConfig,ConfigError} from './configSchema.js';
const [file,...command]=process.argv.slice(2);
try {
 if(!file||!command.length)throw new ConfigError(['EXEC_ARGS_REQUIRED']);
 const env={...process.env,...readEnvironmentFile(file)};
 loadConfig(env);
 const child=spawn(command[0],command.slice(1),{env,stdio:'inherit',shell:false});
 child.on('error',()=>{console.error('CONFIG_EXEC_SPAWN_FAILED');process.exitCode=1;});
 child.on('exit',(code,signal)=>{process.exitCode=signal?1:code??1;});
} catch(error){console.error(error instanceof ConfigError?error.message:'CONFIG_EXEC_REJECTED');process.exitCode=1;}
