import { ApiProperty } from '@nestjs/swagger';

/**
 * Standardized base response format for all API endpoints.
 * All successful responses must extend or use this structure.
 */
export class BaseResponse {
  @ApiProperty({ example: 200, description: 'HTTP status code' })
  statusCode!: number;

  @ApiProperty({ example: 'Success', description: 'Status message' })
  message!: string;
}
