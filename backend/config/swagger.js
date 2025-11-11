/**
 * Swagger API Documentation Configuration
 */

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Dibya Klinik API',
            version: '1.0.0',
            description: 'Medical clinic management system API documentation',
            contact: {
                name: 'API Support',
                email: 'support@dibyaklinik.com'
            },
            license: {
                name: 'Private',
                url: 'https://dibyaklinik.com/license'
            }
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Development server'
            },
            {
                url: 'https://api.dibyaklinik.com',
                description: 'Production server'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Enter JWT token obtained from /api/v1/auth/login'
                }
            },
            schemas: {
                Patient: {
                    type: 'object',
                    required: ['id', 'full_name'],
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Unique patient identifier',
                            example: 'P001'
                        },
                        full_name: {
                            type: 'string',
                            description: 'Patient full name',
                            example: 'John Doe'
                        },
                        whatsapp: {
                            type: 'string',
                            description: 'WhatsApp phone number',
                            example: '+6281234567890'
                        },
                        birth_date: {
                            type: 'string',
                            format: 'date',
                            description: 'Date of birth',
                            example: '1990-01-15'
                        },
                        age: {
                            type: 'integer',
                            description: 'Calculated age',
                            example: 33
                        },
                        allergy: {
                            type: 'string',
                            description: 'Known allergies',
                            example: 'Penicillin'
                        },
                        medical_history: {
                            type: 'string',
                            description: 'Medical history notes',
                            example: 'Hypertension, Diabetes'
                        },
                        last_visit: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Last visit date',
                            example: '2024-01-15T10:30:00Z'
                        }
                    }
                },
                Obat: {
                    type: 'object',
                    required: ['code', 'name', 'category', 'price'],
                    properties: {
                        id: {
                            type: 'integer',
                            description: 'Medication ID',
                            example: 1
                        },
                        code: {
                            type: 'string',
                            description: 'Medication code',
                            example: 'MED001'
                        },
                        name: {
                            type: 'string',
                            description: 'Medication name',
                            example: 'Paracetamol 500mg'
                        },
                        category: {
                            type: 'string',
                            description: 'Medication category',
                            example: 'Analgesic'
                        },
                        price: {
                            type: 'number',
                            format: 'float',
                            description: 'Price per unit',
                            example: 5000
                        },
                        stock: {
                            type: 'integer',
                            description: 'Current stock quantity',
                            example: 100
                        },
                        unit: {
                            type: 'string',
                            description: 'Unit of measurement',
                            example: 'tablet'
                        },
                        min_stock: {
                            type: 'integer',
                            description: 'Minimum stock threshold',
                            example: 10
                        },
                        is_active: {
                            type: 'boolean',
                            description: 'Active status',
                            example: true
                        }
                    }
                },
                User: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'integer',
                            example: 1
                        },
                        username: {
                            type: 'string',
                            example: 'admin'
                        },
                        full_name: {
                            type: 'string',
                            example: 'Dr. Admin'
                        },
                        role: {
                            type: 'string',
                            enum: ['admin', 'doctor', 'nurse', 'receptionist'],
                            example: 'doctor'
                        }
                    }
                },
                Success: {
                    type: 'object',
                    properties: {
                        success: {
                            type: 'boolean',
                            example: true
                        },
                        message: {
                            type: 'string',
                            example: 'Operation successful'
                        },
                        data: {
                            type: 'object',
                            description: 'Response data'
                        },
                        timestamp: {
                            type: 'string',
                            format: 'date-time',
                            example: '2024-01-15T10:30:00Z'
                        }
                    }
                },
                Error: {
                    type: 'object',
                    properties: {
                        success: {
                            type: 'boolean',
                            example: false
                        },
                        message: {
                            type: 'string',
                            example: 'Error message'
                        },
                        error: {
                            type: 'string',
                            description: 'Error details (dev only)'
                        },
                        timestamp: {
                            type: 'string',
                            format: 'date-time'
                        }
                    }
                }
            },
            responses: {
                Unauthorized: {
                    description: 'Authentication required',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/Error'
                            }
                        }
                    }
                },
                Forbidden: {
                    description: 'Access denied',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/Error'
                            }
                        }
                    }
                },
                NotFound: {
                    description: 'Resource not found',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/Error'
                            }
                        }
                    }
                },
                ValidationError: {
                    description: 'Validation error',
                    content: {
                        'application/json': {
                            schema: {
                                allOf: [
                                    { $ref: '#/components/schemas/Error' },
                                    {
                                        type: 'object',
                                        properties: {
                                            errors: {
                                                type: 'array',
                                                items: {
                                                    type: 'object',
                                                    properties: {
                                                        field: { type: 'string' },
                                                        message: { type: 'string' }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
            }
        },
        tags: [
            {
                name: 'Authentication',
                description: 'User authentication endpoints'
            },
            {
                name: 'Patients',
                description: 'Patient management endpoints'
            },
            {
                name: 'Medications',
                description: 'Medication (Obat) management endpoints'
            },
            {
                name: 'Monitoring',
                description: 'Health check and metrics endpoints'
            }
        ]
    },
    apis: ['./routes/v1/*.js', './routes/*.js', './swagger/paths/*.js']
};

module.exports = swaggerJsdoc(options);
