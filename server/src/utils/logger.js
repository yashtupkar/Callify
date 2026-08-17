class Logger {
  info(context, message, data = {}) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      context,
      message,
      ...data
    }));
  }

  warn(context, message, data = {}) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      context,
      message,
      ...data
    }));
  }

  error(context, message, error = null) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      context,
      message,
      error: error ? error.toString() : null
    }));
  }
}

module.exports = new Logger();
