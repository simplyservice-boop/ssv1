const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');

function cleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function walk(dirPath) {
  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return walk(resolved);
    return entry.isFile() && resolved.endsWith('.ts') ? [resolved] : [];
  });
}

function transpileFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      sourceMap: true,
      esModuleInterop: true,
    },
    fileName: filePath,
  });

  const outputRelative = path.relative(srcDir, filePath).replace(/\.ts$/, '.js');
  const outputPath = path.join(distDir, outputRelative);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, result.outputText, 'utf8');
  if (result.sourceMapText) {
    fs.writeFileSync(`${outputPath}.map`, result.sourceMapText, 'utf8');
  }
}

cleanDir(distDir);
walk(srcDir).forEach(transpileFile);
console.log(`Transpiled API sources to ${path.relative(rootDir, distDir)}`);