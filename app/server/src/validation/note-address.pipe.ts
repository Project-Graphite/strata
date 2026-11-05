import { Injectable, NotFoundException, type PipeTransform } from '@nestjs/common';
import { isUUID } from 'class-validator';

export const noteSlugPattern = /^[0-9a-f]{10}$/;

@Injectable()
export class NoteAddressPipe implements PipeTransform<string, string> {
  transform(value: string) {
    if (isUUID(value) || noteSlugPattern.test(value)) return value;
    throw new NotFoundException('Nothing was found at this address');
  }
}