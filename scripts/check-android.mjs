import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { findJava21 } from './java-runtime.mjs';
const nativeJava = findJava21(), nativeJavaHome = path.dirname(path.dirname(nativeJava));
const cached = process.argv.includes('--cached-gradle');
const nativeCommand = cached ? '..\\.cache\\gradle\\gradle-8.14.3\\bin\\gradle.bat assembleDebug' : 'gradlew.bat assembleDebug';
const result = spawnSync(process.platform === 'win32' ? 'cmd.exe' : cached ? '../.cache/gradle/gradle-8.14.3/bin/gradle' : './gradlew', process.platform === 'win32' ? ['/d', '/s', '/c', nativeCommand] : ['assembleDebug'], { cwd: path.resolve('android'), stdio: 'inherit', windowsHide: true, env: { ...process.env, JAVA_HOME: nativeJavaHome, PATH: `${path.dirname(nativeJava)}${path.delimiter}${process.env.PATH || ''}` } });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
