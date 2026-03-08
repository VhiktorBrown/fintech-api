import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { GetUser } from 'src/auth/decorator';
import { JwtGuard } from 'src/auth/guard';
import { BvnDto, NinDto, PersonalInfoDto, TransactionPinDto } from 'src/auth/dto';
import { UserService } from './user.service';
import { ChangePinDto } from './dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('users')
export class UserController {
    constructor(private userService: UserService) {}

    @ApiOperation({ summary: 'Get your own profile' })
    @Get('me')
    getMyProfile(@GetUser() user: User) {
        return user;
    }

    @ApiOperation({ summary: 'Update personal info (name, DOB, phone, address)' })
    @Patch('personal-info')
    savePersonalInfo(
        @GetUser('id') userId: number,
        @Body() dto: PersonalInfoDto,
    ) {
        return this.userService.setPersonalInfo(userId, dto);
    }

    @ApiOperation({ summary: 'Set BVN (one-time, stored encrypted)' })
    @Post('bvn')
    enterBvn(
        @GetUser('id') userId: number,
        @Body() dto: BvnDto,
    ) {
        return this.userService.setBvn(userId, dto);
    }

    @ApiOperation({ summary: 'Set NIN (one-time, stored encrypted)' })
    @Post('nin')
    enterNin(
        @GetUser('id') userId: number,
        @Body() dto: NinDto,
    ) {
        return this.userService.setNin(userId, dto);
    }

    @ApiOperation({ summary: 'Set transaction PIN — also triggers account creation' })
    @Post('transaction-pin')
    saveTransactionPin(
        @GetUser('id') userId: number,
        @Body() dto: TransactionPinDto,
    ) {
        return this.userService.setTransactionPin(userId, dto);
    }

    @ApiOperation({ summary: 'Change transaction PIN' })
    @Patch('transaction-pin')
    changeTransactionPin(
        @GetUser('id') userId: number,
        @Body() dto: ChangePinDto,
    ) {
        return this.userService.changeTransactionPin(userId, dto);
    }
}
