import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) { }

  @Get()
  getUsers() {
    return this.usersService.getUsers();
  }

  @Get(':id')
  getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(Number(id));
  }

  @Delete(':id')
  deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(Number(id));
  }

  @Patch(':id')
  updateUser(@Param(':id') id: string) {
    
  }


  // Disabled: open user creation via this endpoint. Uncomment to re-enable.
  // @Post()
  // createUser(@Body() body: { name: string; email: string; username?: string; password?: string }) {
  //   if (!body.email) {
  //     throw new BadRequestException('email is required');
  //   }
  //   return this.usersService.createUser(body.name, body.email, body.username, body.password);
  // }
}