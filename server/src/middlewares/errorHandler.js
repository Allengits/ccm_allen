/**
 * Central error handling middleware.
 * Formats all errors into standard JSON convention: { success: false, message, errors }
 */
export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);

  const response = {
    success: false,
    message: err.message || 'Internal Server Error',
    errors: err.errors || [err.message || 'Unknown error occurred'],
  };

  // Include stack trace in development mode only
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * 404 Not Found handler for unmatched routes.
 */
export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Not Found - ${req.originalUrl}`,
    errors: [`Route ${req.method} ${req.originalUrl} does not exist`],
  });
};
