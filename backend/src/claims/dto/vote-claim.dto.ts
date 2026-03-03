import { IsEnum } from 'class-validator';
import { ClaimVoteType } from '../../common/enums/claim-vote-type.enum';

export class VoteClaimDto {
  @IsEnum(ClaimVoteType)
  type: ClaimVoteType;
}
