// Usage: node tests/mint-manager-session.mjs <admin|staff> <perm,perm|""> [remainingSeconds]
// Prints the JSON to store under sessionStorage['weve-manager-session-v2'] for local UI checks.
import { mintSession } from './manager-test-env.mjs';

const [role = 'staff', perms = '', remaining] = process.argv.slice(2);
const permissions = perms.split(',').map((value) => value.trim()).filter(Boolean);
const options = remaining === undefined ? {} : { remainingSeconds: Number(remaining) };
process.stdout.write(`${JSON.stringify(mintSession(role === 'admin' ? 'admin' : 'staff', permissions, options))}\n`);
