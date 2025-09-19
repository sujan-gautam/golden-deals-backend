const Joi = require('joi');

const sendMessageValidation = (data) => {
  const schema = Joi.object({
    conversationId: Joi.string().required().messages({
      'string.base': 'Conversation ID must be a string',
      'any.required': 'Conversation ID is required',
    }),
    content: Joi.string().min(1).required().messages({
      'string.base': 'Message content must be a string',
      'string.min': 'Message content cannot be empty',
      'any.required': 'Message content is required',
    }),
  });
  return schema.validate(data);
};

module.exports = { sendMessageValidation };