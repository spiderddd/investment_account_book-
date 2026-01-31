
export const sendSuccess = (res, data) => {
    res.json(data);
};

export const sendError = (res, error, context = "An error occurred") => {
    console.error(`[${context}]`, error);
    // Hide internal DB errors in production, show generic message
    // unless it's a known validation error (can be extended)
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? "Internal Server Error" : error.message;
    
    res.status(statusCode).json({ error: message });
};
