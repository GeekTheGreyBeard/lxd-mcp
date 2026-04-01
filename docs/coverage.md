# Test Coverage Documentation

## Coverage Requirements

This project requires a minimum of **90% code coverage** for all source files.

### Coverage Thresholds

- **Lines**: 90%
- **Branches**: 90%
- **Functions**: 90%
- **Statements**: 90%

### Per-File Requirements

All source files in `src/` must meet minimum coverage requirements.

## Coverage Tools and Configuration

### Vitest Configuration

The project uses Vitest with V8 coverage provider:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
    },
  },
});
```

### Running Coverage

```bash
# Run tests with coverage
npm test -- --coverage

# Generate HTML report
npm test -- --coverage --reporter=html
```

## Process for Improving Coverage

1. **Run coverage report**: `npm test -- --coverage`
2. **Review uncovered lines** in the HTML report (`coverage/index.html`)
3. **Add tests** for uncovered code paths
4. **Focus on**:
   - Error handling paths
   - Edge cases
   - Conditional branches
   - Exception handlers
5. **Re-run coverage** to verify improvements

### CI Integration

GitHub Actions workflow (`.github/workflows/test.yml`):
- Runs tests on every push and PR
- Uploads coverage to Codecov
- Can block PRs on coverage threshold failure

### Coverage Reports

- Text summary: Shown in terminal after test run
- HTML report: `coverage/index.html` for detailed analysis
- Codecov: Cloud-based trend tracking (requires API token)
