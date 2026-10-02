import { IsIn } from 'class-validator';

export const IsColor = () =>
  IsIn(['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'], {
    message: 'Choose a colour from the list.',
  });
