const { poseidonContract } = require('circomlibjs');
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '../circuits/build');
fs.mkdirSync(buildDir, { recursive: true });

const bytecodes = {
  PoseidonT2: {
    abi: poseidonContract.generateABI(1),
    bytecode: poseidonContract.createCode(1)
  },
  PoseidonT3: {
    abi: poseidonContract.generateABI(2),
    bytecode: poseidonContract.createCode(2)
  }
};

fs.writeFileSync(
  path.join(buildDir, 'poseidon-bytecodes.json'),
  JSON.stringify(bytecodes, null, 2)
);
console.log('Done. PoseidonT2 and PoseidonT3 bytecodes written.');
